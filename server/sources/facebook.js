// Facebook groups. Facebook has no API for reading group posts, so this opens the
// groups in the app's browser profile, where you logged in once with
// `npm run facebook:login`, and reads the newest posts from the page.
//
// Use a secondary account if you can: automated browsing is against Facebook's
// terms, and the account may get checkpointed. Keep the number of groups modest.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { acquireContext } from '../browser.js';

export function facebookConfigured() {
  return fs.existsSync(config.facebook.loginMarker);
}

export function groupFeedUrl(group) {
  const s = String(group).trim();
  const id = s.match(/groups\/([^/?#]+)/)?.[1] ?? s;
  return `https://www.facebook.com/groups/${id}/?sorting_setting=CHRONOLOGICAL`;
}

// Runs in the page. Kept free of closures so Playwright can serialize it.
// Posts are the feed's direct children; comments inside them are role="article".
export function extractPostsInPage() {
  const feed = document.querySelector('div[role="feed"]');
  const posts = feed
    ? [...feed.children]
    : [...document.querySelectorAll('div[role="article"]')].filter((a) => !a.parentElement?.closest('div[role="article"]'));
  // A comment is an article nested in another article, or one labelled as a comment.
  const isComment = (article, post) => {
    if (!article || article === post || !post.contains(article)) return false;
    const outer = article.parentElement?.closest('div[role="article"]');
    if (outer && post.contains(outer)) return true;
    return /comment|תגובה/i.test(article.getAttribute('aria-label') ?? '');
  };
  const inComment = (node, post) => {
    for (let a = node.closest('div[role="article"]'); a && post.contains(a); a = a.parentElement?.closest('div[role="article"]')) {
      if (isComment(a, post)) return true;
    }
    return false;
  };
  const results = [];
  const seen = new Set();
  for (const post of posts) {
    const messageNode = [...post.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"]')].find((n) => !inComment(n, post));
    let text = messageNode?.innerText?.trim();
    if (!text) {
      const blocks = [...post.querySelectorAll('div[dir="auto"]')]
        .filter((d) => !inComment(d, post))
        .map((d) => d.innerText.trim())
        .filter((t) => t.length > 20);
      text = blocks.sort((a, b) => b.length - a.length)[0];
    }
    if (!text) continue;
    const links = [...post.querySelectorAll('a[href]')].filter((a) => !inComment(a, post)).map((a) => a.href);
    const permalink = links.find((h) => /\/groups\/[^/]+\/(?:posts|permalink)\/\d+/.test(h)) ?? links.find((h) => /\/posts\/|story_fbid=|\/permalink\//.test(h)) ?? null;
    const key = permalink?.split('?')[0] ?? text.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    const author = post.querySelector('h2 a, h3 a, strong a')?.innerText?.trim() ?? null;
    const images = [...post.querySelectorAll('img[src*="scontent"]')].filter((i) => !inComment(i, post)).map((i) => i.src).filter((src, i, a) => a.indexOf(src) === i).slice(0, 4);
    results.push({ text, permalink, author, images });
  }
  return results;
}

export function postId(groupUrl, post) {
  const m = post.permalink?.match(/(?:posts|permalink)\/(\d+)/) ?? post.permalink?.match(/story_fbid=(\d+)/);
  if (m) return m[1];
  return crypto.createHash('sha1').update(`${groupUrl}\n${post.text.slice(0, 300)}`).digest('hex').slice(0, 16);
}

export async function fetchFacebook(groups) {
  if (!facebookConfigured()) {
    throw new Error('Not logged in to Facebook. Stop the app and run `npm run facebook:login`.');
  }
  const { context, release } = await acquireContext();
  try {
    const posts = [];
    const errors = [];
    for (const group of groups) {
      const url = groupFeedUrl(group);
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (/login|checkpoint/.test(new URL(page.url()).pathname)) throw new LoggedOutError();
        await page.waitForSelector('div[role="feed"]', { timeout: 20000 }).catch(() => {});
        const groupName = (await page.title()).replace(/\s*\|\s*Facebook.*$/, '').trim();
        for (let i = 0; i < config.facebook.scrolls; i++) {
          // Expand truncated posts ("See more" / "עוד").
          for (const button of await page.locator('div[role="button"]:text-matches("^(See more|עוד|ראה עוד)$")').all()) {
            await button.click({ timeout: 1000 }).catch(() => {});
          }
          await page.mouse.wheel(0, 2500);
          await page.waitForTimeout(1500 + Math.random() * 1000);
        }
        for (const post of await page.evaluate(extractPostsInPage)) {
          const id = postId(url, post);
          posts.push({
            id: `facebook:${id}`,
            source: 'facebook',
            externalId: id,
            url: post.permalink ?? url,
            text: post.text,
            author: post.author,
            images: post.images,
            postedAt: null,
            sourceName: `פייסבוק · ${groupName || group}`,
          });
        }
      } catch (err) {
        if (err instanceof LoggedOutError) throw err;
        errors.push(`${group}: ${err.message}`);
      } finally {
        await page.close();
      }
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
    }
    if (errors.length && !posts.length) throw new Error(errors.join('; '));
    return { posts, errors };
  } finally {
    await release();
  }
}

class LoggedOutError extends Error {
  constructor() {
    super('Facebook asks to log in again (or to confirm the account). Stop the app and run `npm run facebook:login`.');
  }
}
