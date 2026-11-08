import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authMiddleware, parseUsers } from '../server/users.js';

test('users come from APP_USERS and the older APP_USER pair', () => {
  assert.deepEqual(parseUsers({ APP_USERS: 'tal:secret1:admin, dani:secret2', APP_USER: 'old', APP_PASSWORD: 'p' }), [
    { name: 'tal', password: 'secret1', admin: true },
    { name: 'dani', password: 'secret2', admin: false },
    { name: 'old', password: 'p', admin: true },
  ]);
});

function run(middleware, { hostname = 'localhost', auth } = {}) {
  const req = { hostname, headers: auth ? { authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {} };
  const res = { statusCode: 200, set() { return this; }, status(c) { this.statusCode = c; return this; }, type() { return this; }, send() { return this; } };
  let passed = false;
  middleware(req, res, () => (passed = true));
  return { passed, status: res.statusCode, user: req.user };
}

test('without users only this computer gets in', () => {
  const mw = authMiddleware([]);
  assert.equal(run(mw).passed, true);
  assert.equal(run(mw, { hostname: 'zeevi-apartments.ngrok-free.app' }).status, 403);
});

test('with users, a password is required and the role is attached', () => {
  const mw = authMiddleware(parseUsers({ APP_USERS: 'tal:secret1:admin,dani:secret2' }));
  assert.equal(run(mw).status, 401);
  assert.equal(run(mw, { auth: 'dani:wrong' }).status, 401);
  assert.deepEqual(run(mw, { auth: 'dani:secret2', hostname: 'x.ngrok-free.app' }).user, { name: 'dani', admin: false });
  assert.deepEqual(run(mw, { auth: 'tal:secret1' }).user, { name: 'tal', admin: true });
});
