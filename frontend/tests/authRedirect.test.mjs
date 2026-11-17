import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNext, chooseSignInDestination } from '../lib/authRedirect.ts';

const vectors = [
  ['https://evil.example', null],
  ['//evil.example', null],
  ['/\\evil.example', null],
  ['javascript:alert(1)', null],
  ['%2F%2Fevil.example', null],
  ['/gallery', '/gallery'],
  ['/photographer/dashboard', '/photographer/dashboard'],
];

for (const [value, expected] of vectors) {
  test('requested vector: ' + value, () => {
    assert.equal(validateNext(value), expected);
  });
}

const rejectedPaths = [
  '/%2Fevil.example',
  '/%255Cevil.example',
  '/%252F%252Fevil.example',
  '/gallery%0a',
  '/auth/login',
  '/%61uth/login',
  '/%2561uth/login',
  '/gallery/../auth/login',
  '/gallery/%2e%2e/auth/login',
  '/photographer/login',
  '/photographer/register',
  '/photographer/complete-profile',
  '/gallery%',
];

for (const value of rejectedPaths) {
  test('reject unsafe or auth path: ' + value, () => {
    assert.equal(validateNext(value), null);
  });
}

test('retain a relative destination with query and fragment', () => {
  assert.equal(validateNext('/gallery?view=recent#photos'), '/gallery?view=recent#photos');
});

test('missing destination is rejected', () => {
  assert.equal(validateNext(undefined), null);
  assert.equal(validateNext(null), null);
  assert.equal(validateNext(''), null);
});

const buyer = { role: 'buyer', hasPhotographerProfile: false };

test('admin claim takes priority over next and photographer intent', () => {
  assert.equal(chooseSignInDestination({
    ...buyer, role: 'admin', next: '/gallery', photographerIntent: true,
  }), '/admin');
});

test('a photographer row selects dashboard even when JWT role is buyer', () => {
  assert.equal(chooseSignInDestination({
    ...buyer, hasPhotographerProfile: true,
  }), '/photographer/dashboard');
});

test('photographer JWT role alone does not select dashboard', () => {
  assert.equal(chooseSignInDestination({ ...buyer, role: 'photographer' }), '/gallery');
});

test('photographer intent without a row selects profile completion', () => {
  assert.equal(chooseSignInDestination({
    ...buyer, photographerIntent: true, next: '/gallery',
  }), '/photographer/complete-profile');
});

test('buyer default and invalid external next both select gallery', () => {
  assert.equal(chooseSignInDestination(buyer), '/gallery');
  assert.equal(chooseSignInDestination({ ...buyer, next: 'https://evil.example' }), '/gallery');
});

test('honor an allowed next when the user can access it', () => {
  assert.equal(chooseSignInDestination({
    ...buyer, next: '/gallery?view=recent',
  }), '/gallery?view=recent');
  assert.equal(chooseSignInDestination({
    ...buyer, hasPhotographerProfile: true, next: '/photographer/dashboard',
  }), '/photographer/dashboard');
});

test('buyer protected destinations fall back to gallery', () => {
  for (const next of ['/admin', '/%61dmin', '/%2561dmin', '/photographer/dashboard', '/photographer/submit']) {
    assert.equal(chooseSignInDestination({ ...buyer, next }), '/gallery');
  }
});
