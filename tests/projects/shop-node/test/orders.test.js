const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');

let server;
let base;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('POST /orders creates an order with status new', async () => {
  const res = await post('/orders', { amount: 1500, description: 'Two coffees' });
  assert.ok(res.status === 200 || res.status === 201);
  const order = await res.json();
  assert.equal(typeof order.id, 'string');
  assert.equal(order.status, 'new');
});

test('GET /orders/:id returns the order', async () => {
  const created = await (await post('/orders', { amount: 300, description: 'Tea' })).json();
  const res = await fetch(`${base}/orders/${created.id}`);
  assert.equal(res.status, 200);
  const order = await res.json();
  assert.equal(order.id, created.id);
  assert.equal(order.status, 'new');
});

test('GET /orders/:id of an unknown order is 404', async () => {
  const res = await fetch(`${base}/orders/nope`);
  assert.equal(res.status, 404);
});

test('POST /orders rejects a bad body', async () => {
  const res = await post('/orders', { amount: 'a lot' });
  assert.equal(res.status, 400);
});
