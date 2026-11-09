const crypto = require('node:crypto');
const express = require('express');
const { createOrders } = require('./orders');
const { webhookRouter } = require('./webhook');

function createApp({ config, xpayment, orders = createOrders(), log = console }) {
  const app = express();

  // The webhook reads the raw body, so it is mounted before the JSON parser.
  app.use(webhookRouter({ secret: config.webhookSecret, xpayment, orders, log }));
  app.use(express.json());

  app.post('/orders', async (req, res) => {
    const { amount, description } = req.body ?? {};
    if (typeof amount !== 'number' || !(amount > 0) || typeof description !== 'string') {
      return res.status(400).json({ error: 'amount (number > 0) and description (string) are required' });
    }
    const id = crypto.randomUUID();
    let link;
    try {
      link = await xpayment.createLink({ amount, merchantOrderId: id, idempotencyKey: crypto.randomUUID() });
    } catch (err) {
      log.error(`could not create a payment link: ${err.message}`);
      return res.status(502).json({ error: 'payment link is unavailable' });
    }
    orders.add({ id, amount, description, status: 'new', paymentId: link.payment_id, payment_url: link.qr_token });
    res.status(201).json({ id, status: 'new', payment_url: link.qr_token });
  });

  app.get('/orders/:id', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    res.json({ id: order.id, status: order.status, payment_url: order.payment_url });
  });

  return app;
}

module.exports = { createApp };
