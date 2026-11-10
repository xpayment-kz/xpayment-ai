function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    baseUrl: (env.XPAYMENT_BASE_URL || 'https://api.xpayment.kz').replace(/\/+$/, ''),
    deviceKey: env.XPAYMENT_DEVICE_KEY || '',
    webhookSecret: env.XPAYMENT_WEBHOOK_SECRET || '',
  };
}

module.exports = { loadConfig };
