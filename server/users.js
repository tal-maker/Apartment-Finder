// Who can use the app. APP_USERS="tal:password:admin,dani:password" (no colons in
// passwords). The older APP_USER/APP_PASSWORD pair still works as one admin.
// With no users at all the app answers only on this computer (localhost).
import crypto from 'node:crypto';
import { config } from './config.js';

export const ADMIN_KEY = '@admin';

export function parseUsers(env = process.env) {
  const users = (env.APP_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, password, role] = entry.split(':');
      return { name: name?.trim(), password: password ?? '', admin: role?.trim() === 'admin' };
    })
    .filter((u) => u.name && u.password);
  if (env.APP_USER && env.APP_PASSWORD && !users.some((u) => u.name === env.APP_USER)) {
    users.push({ name: env.APP_USER, password: env.APP_PASSWORD, admin: true });
  }
  return users;
}

export const users = parseUsers();

// A search owner: null (created without login) or an admin user means the admin;
// anything else is a regular user or a person the admin sends alerts to ("person:<name>").
export const isAdmin = (name) => name == null || Boolean(users.find((u) => u.name === name)?.admin);

// Admins share favorites, hidden listings and Telegram recipients; everyone else
// has their own.
export const userKey = (user) => (user.admin ? ADMIN_KEY : user.name);

export function telegramChatsFor(store, owner) {
  const key = isAdmin(owner) ? ADMIN_KEY : owner;
  const saved = store.getSetting(`telegram:${key}`, []);
  return key === ADMIN_KEY ? [...new Set([...config.notify.telegramChatIds.map(String), ...saved])] : saved;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const sameText = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function authMiddleware(list = users) {
  if (!list.length) {
    // Nobody is defined, so nobody outside this computer gets in (e.g. via a tunnel).
    return (req, res, next) => {
      if (LOCAL_HOSTS.has(req.hostname)) {
        req.user = { name: null, admin: true };
        return next();
      }
      res
        .status(403)
        .type('text/plain; charset=utf-8')
        .send('הגישה מבחוץ חסומה: כדי לפתוח את האפליקציה מחוץ למחשב הזה, הגדירו משתמשים ב-APP_USERS בקובץ .env.');
    };
  }
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const decoded = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString() : '';
    const sep = decoded.indexOf(':');
    const name = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);
    const user = sep > 0 ? list.find((u) => sameText(u.name, name) && sameText(u.password, password)) : null;
    if (user) {
      req.user = { name: user.name, admin: user.admin };
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="apartment-finder", charset="UTF-8"').status(401).send('Authentication required');
  };
}
