function createOrders() {
  const byId = new Map();
  const byPayment = new Map();

  return {
    add(order) {
      byId.set(order.id, order);
      if (order.paymentId) byPayment.set(order.paymentId, order.id);
      return order;
    },
    get: (id) => byId.get(id),
    findByPayment(paymentId, merchantOrderId) {
      return byId.get(byPayment.get(paymentId)) ?? byId.get(merchantOrderId);
    },
  };
}

module.exports = { createOrders };
