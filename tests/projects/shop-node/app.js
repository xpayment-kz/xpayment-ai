const crypto = require('node:crypto');
const express = require('express');

function createApp() {
  const app = express();
  const orders = new Map();

  app.use(express.json());

  app.post('/orders', (req, res) => {
    const { amount, description } = req.body ?? {};
    if (typeof amount !== 'number' || !(amount > 0) || typeof description !== 'string') {
      return res.status(400).json({ error: 'amount (number > 0) and description (string) are required' });
    }
    const order = { id: crypto.randomUUID(), amount, description, status: 'new' };
    orders.set(order.id, order);
    res.status(201).json({ id: order.id, status: order.status });
  });

  app.get('/orders/:id', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    const view = { id: order.id, status: order.status };
    if (order.payment_url) view.payment_url = order.payment_url;
    res.json(view);
  });

  return app;
}

module.exports = { createApp };
