const fs = require('node:fs');
const { loadConfig } = require('./config');
const { createClient } = require('./xpayment');
const { createApp } = require('./app');

// Variables that are already in the environment win over .env.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
if (!config.deviceKey || !config.webhookSecret) {
  console.error('XPAYMENT_DEVICE_KEY and XPAYMENT_WEBHOOK_SECRET must be set (see .env.example)');
  process.exit(1);
}

const xpayment = createClient({ baseUrl: config.baseUrl, deviceKey: config.deviceKey });

createApp({ config, xpayment }).listen(config.port, '127.0.0.1', () => {
  console.log(`shop listening on http://127.0.0.1:${config.port}`);
});
