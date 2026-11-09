class XPaymentError extends Error {
  constructor(status, body) {
    super(`xPayment answered ${status}${body && body.error ? ` ${body.error}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

function createClient({ baseUrl, deviceKey, fetchImpl = fetch }) {
  async function request(method, path, { body, idempotencyKey } = {}) {
    const headers = { Authorization: `Bearer ${deviceKey}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
    const res = await fetchImpl(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) throw new XPaymentError(res.status, data);
    return data;
  }

  return {
    createLink: ({ amount, merchantOrderId, idempotencyKey }) =>
      request('POST', '/v1/payments/link', {
        body: { amount, merchant_order_id: merchantOrderId },
        idempotencyKey,
      }),
    getPayment: (paymentId) => request('GET', `/v1/payments/${encodeURIComponent(paymentId)}`),
  };
}

module.exports = { createClient, XPaymentError };
