import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startFake } from './server.mjs';

// Key-shaped strings are built at runtime so no key-shaped literal is committed.
const hex = (c) => c.repeat(64);
const V2_TEST_KEY = 'xapi_test_' + hex('a');
const V2_LIVE_KEY = 'xapi_' + hex('b');
const V1_DEVICE_KEY = 'xdev_' + hex('c');
const V1_TEST_DEVICE_KEY = 'xdev_test_' + hex('d');

let fake;
before(async () => {
  fake = await startFake({ port: 0 });
});
after(async () => {
  await fake.close();
});
beforeEach(async () => {
  await call('POST', '/__reset');
});

async function call(method, path, { key, body, headers = {} } = {}) {
  const h = { ...headers };
  if (key) h.authorization = `Bearer ${key}`;
  let payload;
  if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(fake.url + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, text };
}

test('v2 create link with xapi_test_ key and device_name -> 200, the shape of POST /v2/payments/link', async () => {
  const r = await call('POST', '/v2/payments/link', {
    key: V2_TEST_KEY,
    body: { device_name: 'test', amount: 1500, merchant_order_id: 'order-42' },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), [
    'environment',
    'expire_date',
    'ext_tran_id',
    'payment_id',
    'qr_operation_id',
    'qr_token',
    'status',
  ]);
  assert.match(r.json.payment_id, /^[0-9a-f-]{36}$/);
  assert.match(r.json.qr_token, /^https:\/\/qr\.kaspi\.kz\/\d+$/);
  assert.equal(typeof r.json.qr_operation_id, 'number');
  assert.match(r.json.ext_tran_id, /^QR\d+$/);
  assert.equal(r.json.status, 'QrTokenCreated');
  assert.equal(r.json.environment, 'sandbox');
  assert.ok(!Number.isNaN(Date.parse(r.json.expire_date)));
});

test('v2 create link with a live key reports environment live', async () => {
  const r = await call('POST', '/v2/payments/link', { key: V2_LIVE_KEY, body: { device_name: 'Kassa1', amount: 10 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.environment, 'live');
});

test('v2 without device_name -> 400 VALIDATION_ERROR', async () => {
  const r = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body: { amount: 1500 } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'VALIDATION_ERROR');
  assert.equal(typeof r.json.message, 'string');
  const direct = await call('POST', '/v2/payments', {
    key: V2_TEST_KEY,
    body: { amount: 1500, payer_phone: '+77001234567' },
  });
  assert.equal(direct.status, 400);
  assert.equal(direct.json.error, 'VALIDATION_ERROR');
});

test('v2 rejects a bad device_name and a bad amount', async () => {
  const badName = await call('POST', '/v2/payments/link', { key: V2_LIVE_KEY, body: { device_name: 'Kassa 1!', amount: 5 } });
  assert.equal(badName.status, 400);
  const badAmount = await call('POST', '/v2/payments/link', { key: V2_LIVE_KEY, body: { device_name: 'Kassa1', amount: 0 } });
  assert.equal(badAmount.status, 400);
  assert.equal(badAmount.json.error, 'VALIDATION_ERROR');
  const notJson = await call('POST', '/v2/payments/link', { key: V2_LIVE_KEY, body: '{nope' });
  assert.equal(notJson.status, 400);
});

test('a test key only knows the test cashbox', async () => {
  const r = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body: { device_name: 'Kassa1', amount: 5 } });
  assert.equal(r.status, 404);
  assert.equal(r.json.error, 'DEVICE_NOT_FOUND');
});

test('xdev_ key on /v2 -> 401, xapi_ key on /v1 -> 401', async () => {
  const a = await call('POST', '/v2/payments/link', { key: V1_DEVICE_KEY, body: { device_name: 'test', amount: 1 } });
  assert.equal(a.status, 401);
  assert.equal(a.json.error, 'UNAUTHORIZED');
  const b = await call('POST', '/v1/payments/link', { key: V2_LIVE_KEY, body: { amount: 1 } });
  assert.equal(b.status, 401);
  const c = await call('POST', '/v1/payments/link', { key: V2_TEST_KEY, body: { amount: 1 } });
  assert.equal(c.status, 401);
  const none = await call('POST', '/v2/payments/link', { body: { device_name: 'test', amount: 1 } });
  assert.equal(none.status, 401);
  const other = await call('GET', '/v2/payments/abc', { key: 'xusr_pat_' + hex('e') });
  assert.equal(other.status, 401);
});

test('same X-Idempotency-Key -> same payment', async () => {
  const body = { device_name: 'test', amount: 700, merchant_order_id: 'o-1' };
  const h = { 'x-idempotency-key': 'key-1' };
  const first = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body, headers: h });
  const again = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body, headers: h });
  const other = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body, headers: { 'x-idempotency-key': 'key-2' } });
  const none1 = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body });
  const none2 = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body });
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.equal(again.json.payment_id, first.json.payment_id);
  assert.notEqual(other.json.payment_id, first.json.payment_id);
  assert.notEqual(none1.json.payment_id, none2.json.payment_id);
  const list = await call('GET', '/__payments');
  assert.equal(list.json.length, 4);
});

test('v2 direct payment -> 201 payment object, idempotent too', async () => {
  const body = { device_name: 'test', amount: 250, payer_phone: '+77001234567', comment: 'Order #1', merchant_order_id: 'o-9' };
  const h = { 'x-idempotency-key': 'direct-1' };
  const a = await call('POST', '/v2/payments', { key: V2_TEST_KEY, body, headers: h });
  const b = await call('POST', '/v2/payments', { key: V2_TEST_KEY, body, headers: h });
  assert.equal(a.status, 201);
  assert.equal(b.json.payment_id, a.json.payment_id);
  assert.equal(a.json.status, 'PENDING');
  assert.equal(a.json.amount, 250);
  assert.equal(a.json.currency, 'KZT');
  assert.equal(a.json.device_name, 'test');
  assert.equal(a.json.merchant_order_id, 'o-9');
  assert.equal(a.json.payer_phone, '+77001234567');
  assert.equal(a.json.environment, 'sandbox');
  const noPhone = await call('POST', '/v2/payments', { key: V2_TEST_KEY, body: { device_name: 'test', amount: 5 } });
  assert.equal(noPhone.status, 400);
});

test('GET /v2/payments/{id} after POST /__pay/{id} -> status COMPLETED', async () => {
  const link = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body: { device_name: 'test', amount: 1500, merchant_order_id: 'order-42' } });
  const id = link.json.payment_id;
  const before = await call('GET', `/v2/payments/${id}`, { key: V2_TEST_KEY });
  assert.equal(before.status, 200);
  assert.equal(before.json.status, 'QR_TOKEN_CREATED');
  const paid = await call('POST', `/__pay/${id}`);
  assert.equal(paid.status, 200);
  const after = await call('GET', `/v2/payments/${id}`, { key: V2_TEST_KEY });
  assert.equal(after.status, 200);
  assert.equal(after.json.status, 'COMPLETED');
  assert.equal(after.json.payment_id, id);
  assert.equal(after.json.merchant_order_id, 'order-42');
  assert.equal(after.json.amount, 1500);
  assert.ok(after.json.completed_at);
  const missing = await call('GET', '/v2/payments/does-not-exist', { key: V2_TEST_KEY });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'PAYMENT_NOT_FOUND');
});

test('POST /__pay/{id} takes an outcome', async () => {
  const outcomes = { expired: 'EXPIRED', declined: 'CANCELLED', cancelled: 'CANCELLED', failed: 'FAILED', refunded: 'REFUNDED' };
  for (const [outcome, status] of Object.entries(outcomes)) {
    const link = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body: { device_name: 'test', amount: 5 } });
    const id = link.json.payment_id;
    const r = await call('POST', `/__pay/${id}`, { body: { outcome } });
    assert.equal(r.status, 200, outcome);
    const got = await call('GET', `/v2/payments/${id}`, { key: V2_TEST_KEY });
    assert.equal(got.json.status, status, outcome);
  }
  const bad = await call('POST', '/__pay/nope');
  assert.equal(bad.status, 404);
});

test('POST /v2/payments/{id}/refund -> refund object', async () => {
  const link = await call('POST', '/v2/payments/link', { key: V2_TEST_KEY, body: { device_name: 'test', amount: 1500 } });
  const id = link.json.payment_id;
  const tooEarly = await call('POST', `/v2/payments/${id}/refund`, { key: V2_TEST_KEY, body: { amount: 500 } });
  assert.equal(tooEarly.status, 409);
  await call('POST', `/__pay/${id}`);
  const r = await call('POST', `/v2/payments/${id}/refund`, { key: V2_TEST_KEY, body: { amount: 500, reason: 'Product returned' } });
  assert.equal(r.status, 202);
  assert.match(r.json.refund_id, /^[0-9a-f-]{36}$/);
  assert.equal(r.json.payment_id, id);
  assert.equal(r.json.amount, 500);
  assert.equal(r.json.reason, 'Product returned');
  assert.equal(r.json.status, 'PENDING');
  assert.equal(r.json.environment, 'sandbox');
  const partial = await call('GET', `/v2/payments/${id}`, { key: V2_TEST_KEY });
  assert.equal(partial.json.status, 'PARTIALLY_REFUNDED');
  const rest = await call('POST', `/v2/payments/${id}/refund`, { key: V2_TEST_KEY, body: { amount: 1000 } });
  assert.equal(rest.status, 202);
  const full = await call('GET', `/v2/payments/${id}`, { key: V2_TEST_KEY });
  assert.equal(full.json.status, 'REFUNDED');
  const noAmount = await call('POST', `/v2/payments/${id}/refund`, { key: V2_TEST_KEY, body: {} });
  assert.equal(noAmount.status, 400);
});

test('GET /v2/devices lists the cashboxes of the key', async () => {
  const t = await call('GET', '/v2/devices', { key: V2_TEST_KEY });
  assert.equal(t.status, 200);
  assert.deepEqual(t.json.devices.map((d) => d.device_name), ['test']);
  assert.equal(t.json.devices[0].is_active, true);
  assert.equal(t.json.devices[0].session_problem_since, null);
  const live = await call('GET', '/v2/devices', { key: V2_LIVE_KEY });
  assert.equal(live.status, 200);
  assert.ok(live.json.devices.length >= 1);
  const v1 = await call('GET', '/v1/devices', { key: V1_DEVICE_KEY });
  assert.equal(v1.status, 404);
});

test('v1: link, payment, get, refund with an xdev_ key; no device_name needed', async () => {
  const link = await call('POST', '/v1/payments/link', {
    key: V1_TEST_DEVICE_KEY,
    body: { amount: 900, merchant_order_id: 'o-1' },
    headers: { 'x-idempotency-key': 'v1-key' },
  });
  assert.equal(link.status, 200);
  assert.equal(link.json.status, 'QrTokenCreated');
  assert.equal(link.json.environment, 'sandbox');
  const again = await call('POST', '/v1/payments/link', {
    key: V1_TEST_DEVICE_KEY,
    body: { amount: 900, merchant_order_id: 'o-1' },
    headers: { 'x-idempotency-key': 'v1-key' },
  });
  assert.equal(again.json.payment_id, link.json.payment_id);

  const noAmount = await call('POST', '/v1/payments/link', { key: V1_DEVICE_KEY, body: {} });
  assert.equal(noAmount.status, 400);
  assert.equal(noAmount.json.error, 'VALIDATION_ERROR');

  const direct = await call('POST', '/v1/payments', { key: V1_DEVICE_KEY, body: { amount: 10, payer_phone: '+77001234567' } });
  assert.equal(direct.status, 201);
  assert.equal(direct.json.environment, 'live');
  assert.equal(direct.json.status, 'PENDING');

  await call('POST', `/__pay/${link.json.payment_id}`);
  const got = await call('GET', `/v1/payments/${link.json.payment_id}`, { key: V1_TEST_DEVICE_KEY });
  assert.equal(got.status, 200);
  assert.equal(got.json.status, 'COMPLETED');
  const refund = await call('POST', `/v1/payments/${link.json.payment_id}/refund`, { key: V1_TEST_DEVICE_KEY, body: { amount: 900 } });
  assert.equal(refund.status, 202);
  assert.equal(refund.json.payment_id, link.json.payment_id);
});

test('an unknown path is a 404 JSON error', async () => {
  const r = await call('GET', '/v2/nothing-here', { key: V2_LIVE_KEY });
  assert.equal(r.status, 404);
  assert.equal(r.json.error, 'NOT_FOUND');
});

test('GET /__requests -> every call with method, path, auth prefix only (never the key), idempotency header, body', async () => {
  await call('POST', '/v2/payments/link', {
    key: V2_TEST_KEY,
    body: { device_name: 'test', amount: 1500, merchant_order_id: 'order-42' },
    headers: { 'x-idempotency-key': 'abc-123' },
  });
  await call('POST', '/v2/payments', { key: V1_DEVICE_KEY, body: { device_name: 'test', amount: 1, payer_phone: '+7' } });
  await call('GET', '/v1/payments/zzz', { key: V1_TEST_DEVICE_KEY });
  await call('GET', '/v2/devices');

  const r = await call('GET', '/__requests');
  assert.equal(r.status, 200);
  const log = r.json;
  assert.equal(log.length, 4, '/__ calls are not logged');

  assert.equal(log[0].method, 'POST');
  assert.equal(log[0].path, '/v2/payments/link');
  assert.equal(log[0].auth, 'xapi_test_');
  assert.equal(log[0].idempotency_key, 'abc-123');
  assert.deepEqual(log[0].body, { device_name: 'test', amount: 1500, merchant_order_id: 'order-42' });
  assert.equal(log[0].status, 200);
  assert.match(log[0].payment_id, /^[0-9a-f-]{36}$/);

  assert.equal(log[1].auth, 'xdev_');
  assert.equal(log[1].status, 401);
  assert.equal(log[1].idempotency_key, null);

  assert.equal(log[2].method, 'GET');
  assert.equal(log[2].path, '/v1/payments/zzz');
  assert.equal(log[2].auth, 'xdev_test_');
  assert.equal(log[2].body, null);

  assert.equal(log[3].auth, 'none');

  for (const secret of [V2_TEST_KEY, V1_DEVICE_KEY, V1_TEST_DEVICE_KEY]) {
    assert.ok(!r.text.includes(secret), 'the log must not hold a key');
    assert.ok(!r.text.includes(secret.slice(-20)), 'the log must not hold a part of a key');
  }
  assert.ok(!/Bearer/i.test(r.text), 'the log must not hold the Authorization header');

  const cleared = await call('DELETE', '/__requests');
  assert.equal(cleared.status, 200);
  assert.equal((await call('GET', '/__requests')).json.length, 0);
});
