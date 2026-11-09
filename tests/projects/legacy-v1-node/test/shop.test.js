const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../app');
const { createOrders } = require('../orders');

const SECRET = 'test-webhook-secret';
const quiet = { warn() {}, error() {} };

let server;
let base;
let payments; // payment_id -> payment returned by the stubbed GET
let calls;

const xpayment = {
  async createLink({ amount, merchantOrderId, idempotencyKey }) {
    calls.createLink.push({ amount, merchantOrderId, idempotencyKey });
    const payment_id = crypto.randomUUID();
    payments.set(payment_id, { payment_id, status: 'QR_TOKEN_CREATED', merchant_order_id: merchantOrderId });
    return { payment_id, qr_token: `https://qr.kaspi.kz/${payment_id}` };
  },
  async getPayment(id) {
    calls.getPayment.push(id);
    return payments.get(id);
  },
};

beforeEach(async () => {
  payments = new Map();
  calls = { createLink: [], getPayment: [] };
  const app = createApp({ config: { webhookSecret: SECRET }, xpayment, orders: createOrders(), log: quiet });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => server.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function newOrder() {
  const res = await post('/orders', { amount: 1500, description: 'Two coffees' });
  assert.equal(res.status, 201);
  return res.json();
}

function sendEvent(event, { secret = SECRET, deliveryId = crypto.randomUUID(), paymentId } = {}) {
  const raw = JSON.stringify({ event, event_version: '1', delivery_id: deliveryId, attempt_number: 1, source: 'xpayment', payment_id: paymentId });
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return fetch(`${base}/webhooks/xpayment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xpayment-signature': signature },
    body: raw,
  });
}

test('POST /orders returns {id, status: new} and a payment link', async () => {
  const order = await newOrder();
  assert.equal(typeof order.id, 'string');
  assert.equal(order.status, 'new');
  assert.match(order.payment_url, /^https:\/\/qr\.kaspi\.kz\//);
  assert.equal(calls.createLink.length, 1);
  assert.equal(calls.createLink[0].merchantOrderId, order.id);
  assert.ok(calls.createLink[0].idempotencyKey);
});

test('GET /orders/:id returns the order', async () => {
  const order = await newOrder();
  const got = await (await fetch(`${base}/orders/${order.id}`)).json();
  assert.equal(got.id, order.id);
  assert.equal(got.status, 'new');
  assert.equal(got.payment_url, order.payment_url);
  assert.equal((await fetch(`${base}/orders/nope`)).status, 404);
});

test('a signed payment.completed marks the order paid after a GET of the payment', async () => {
  const order = await newOrder();
  const paymentId = [...payments.keys()][0];
  payments.get(paymentId).status = 'COMPLETED';
  const res = await sendEvent('payment.completed', { paymentId });
  assert.equal(res.status, 200);
  assert.deepEqual(calls.getPayment, [paymentId]);
  assert.equal((await (await fetch(`${base}/orders/${order.id}`)).json()).status, 'paid');
});

test('a wrong signature is 401 and changes nothing', async () => {
  const order = await newOrder();
  const paymentId = [...payments.keys()][0];
  payments.get(paymentId).status = 'COMPLETED';
  const res = await sendEvent('payment.completed', { paymentId, secret: 'another-secret' });
  assert.equal(res.status, 401);
  assert.equal(calls.getPayment.length, 0);
  assert.equal((await (await fetch(`${base}/orders/${order.id}`)).json()).status, 'new');
});

test('a signature with a sha256= prefix is refused', async () => {
  const raw = JSON.stringify({ event: 'payment.completed', delivery_id: 'd-1', payment_id: 'p-1' });
  const signature = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  const res = await fetch(`${base}/webhooks/xpayment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xpayment-signature': signature },
    body: raw,
  });
  assert.equal(res.status, 401);
});

test('the same delivery_id is processed once', async () => {
  await newOrder();
  const paymentId = [...payments.keys()][0];
  payments.get(paymentId).status = 'COMPLETED';
  const deliveryId = crypto.randomUUID();
  assert.equal((await sendEvent('payment.completed', { paymentId, deliveryId })).status, 200);
  assert.equal((await sendEvent('payment.completed', { paymentId, deliveryId })).status, 200);
  assert.equal(calls.getPayment.length, 1);
});

test('refund, expiry, cancel and failure are mapped by the payment status', async () => {
  const cases = [
    ['payment.refunded', 'REFUNDED', 'refunded'],
    ['payment.expired', 'EXPIRED', 'payment_failed'],
    ['payment.cancelled', 'CANCELLED', 'payment_failed'],
    ['payment.failed', 'FAILED', 'payment_failed'],
  ];
  for (const [event, paymentStatus, orderStatus] of cases) {
    const order = await newOrder();
    const paymentId = [...payments.keys()].at(-1);
    payments.get(paymentId).status = paymentStatus;
    assert.equal((await sendEvent(event, { paymentId })).status, 200, event);
    assert.equal((await (await fetch(`${base}/orders/${order.id}`)).json()).status, orderStatus, event);
  }
});
