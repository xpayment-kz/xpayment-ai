const crypto = require('node:crypto');
const express = require('express');

// xPayment status of the payment -> status of the order. Other statuses change nothing.
const ORDER_STATUS = {
  COMPLETED: 'paid',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'refunded',
  EXPIRED: 'payment_failed',
  CANCELLED: 'payment_failed',
  FAILED: 'payment_failed',
};

function signatureMatches(secret, rawBody, header) {
  if (typeof header !== 'string' || !/^[0-9a-f]{64}$/.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(header, 'hex'));
}

function webhookRouter({ secret, xpayment, orders, log = console }) {
  const router = express.Router();
  const seenDeliveries = new Set();

  router.post('/webhooks/xpayment', express.raw({ type: () => true, limit: '256kb' }), async (req, res) => {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody) || !signatureMatches(secret, rawBody, req.get('X-xPayment-Signature'))) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'body is not JSON' });
    }
    const { delivery_id: deliveryId, payment_id: paymentId, merchant_order_id: merchantOrderId } = event ?? {};
    if (typeof deliveryId !== 'string' || typeof paymentId !== 'string') {
      return res.status(400).json({ error: 'delivery_id and payment_id are required' });
    }

    if (seenDeliveries.has(deliveryId)) return res.json({ ok: true, duplicate: true });
    seenDeliveries.add(deliveryId);

    try {
      // The webhook carries no status: ask xPayment for the payment.
      const payment = await xpayment.getPayment(paymentId);
      const next = ORDER_STATUS[payment.status];
      const order = orders.findByPayment(paymentId, merchantOrderId ?? payment.merchant_order_id);
      if (!order) {
        log.warn(`webhook for an unknown order, payment ${paymentId}`);
      } else if (next) {
        order.status = next;
      }
    } catch (err) {
      // Not processed: let xPayment deliver it again.
      seenDeliveries.delete(deliveryId);
      log.error(`webhook ${deliveryId} failed: ${err.message}`);
      return res.status(500).json({ error: 'could not process the event' });
    }
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { webhookRouter, signatureMatches, ORDER_STATUS };
