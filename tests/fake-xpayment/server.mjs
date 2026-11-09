#!/usr/bin/env node
// A fake xPayment API for the test bench. In memory, Node built-ins only.
//
//   node tests/fake-xpayment/server.mjs --port 4010
//
// Real endpoints (the shapes follow the v1 swagger and the v2 OpenAPI of xPayment):
//   v2 (key xapi_ or xapi_test_):  POST /v2/payments/link, POST /v2/payments, GET /v2/payments/{id},
//                                  POST /v2/payments/{id}/refund, GET /v2/devices
//   v1 (key xdev_ or xdev_test_):  POST /v1/payments/link, POST /v1/payments, GET /v1/payments/{id},
//                                  POST /v1/payments/{id}/refund
// A key of the other version, no key, or a key of another kind gets 401 UNAUTHORIZED.
// Only the prefix and a non-empty rest of the key are checked.
//
// Test helpers (not logged):
//   POST   /__pay/{id}    body {"outcome": "paid"|"expired"|"declined"|"cancelled"|"failed"|"refunded"} (default paid)
//   GET    /__requests    every call to a real endpoint: seq, method, path, auth (the key prefix only,
//                         never the key), idempotency_key, body, status, payment_id
//   DELETE /__requests    clears that log
//   GET    /__payments    every payment
//   POST   /__reset       clears payments, refunds, idempotency keys and the log

import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const MAX_BODY = 1024 * 1024;
const KEY_PREFIXES = ['xapi_test_', 'xapi_', 'xdev_test_', 'xdev_', 'xsub_', 'xusr_pat_'];
const OUTCOMES = {
  paid: 'COMPLETED',
  expired: 'EXPIRED',
  declined: 'CANCELLED',
  cancelled: 'CANCELLED',
  failed: 'FAILED',
  refunded: 'REFUNDED',
  partially_refunded: 'PARTIALLY_REFUNDED',
};

const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001';

const error = (status, code, message) => ({ status, body: { error: code, message } });

/** The prefix of a key ("xapi_test_", ...), "other" for a key of no known kind, "none" for no key. */
function authPrefix(header) {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  if (!m) return 'none';
  return KEY_PREFIXES.find((p) => m[1].startsWith(p)) ?? 'other';
}

function bearer(header) {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1] : null;
}

function keyEnvironment(key) {
  if (/^xapi_test_[0-9A-Za-z]+$/.test(key) || /^xdev_test_[0-9A-Za-z]+$/.test(key)) return 'sandbox';
  if (/^xapi_[0-9A-Za-z]+$/.test(key) || /^xdev_[0-9A-Za-z]+$/.test(key)) return 'live';
  return null;
}

/** The environment of the key if it is a valid key of this API version, else null. */
function authorize(version, key) {
  if (!key) return null;
  const env = keyEnvironment(key);
  if (!env) return null;
  const wanted = version === 'v2' ? 'xapi_' : 'xdev_';
  return key.startsWith(wanted) ? env : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(raw) {
  if (raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositiveNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nowIso = () => new Date().toISOString();

export async function startFake({ port = 0, host = '127.0.0.1' } = {}) {
  let seq = 0;
  let log = [];
  const payments = new Map();
  const refunds = [];
  const idempotent = new Map(); // `${version}|${kind}|${key}` -> { status, body, payment_id }

  const publicPayment = (p) => {
    const out = {
      payment_id: p.payment_id,
      user_id: FAKE_USER_ID,
      amount: p.amount,
      currency: 'KZT',
      status: p.status,
      device_name: p.device_name,
      environment: p.environment,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
    for (const k of ['merchant_order_id', 'comment', 'metadata', 'payer_phone', 'completed_at', 'cancelled_at', 'cancel_reason']) {
      if (p[k] !== undefined) out[k] = p[k];
    }
    return out;
  };

  const touch = (p, status) => {
    p.status = status;
    p.updated_at = nowIso();
    if (status === 'COMPLETED') p.completed_at = p.updated_at;
    if (status === 'CANCELLED') {
      p.cancelled_at = p.updated_at;
      p.cancel_reason = 'declined by the payer';
    }
  };

  function createPayment(version, env, body, kind) {
    const id = crypto.randomUUID();
    const t = nowIso();
    const p = {
      payment_id: id,
      amount: body.amount,
      status: kind === 'link' ? 'QR_TOKEN_CREATED' : 'PENDING',
      device_name: version === 'v2' ? body.device_name : env === 'sandbox' ? 'test' : null,
      environment: env,
      created_at: t,
      updated_at: t,
      refunded: 0,
    };
    for (const k of ['merchant_order_id', 'comment', 'metadata', 'payer_phone']) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== '') p[k] = body[k];
    }
    payments.set(id, p);
    return p;
  }

  function validateCreate(version, env, body, kind) {
    if (!isObject(body)) return error(400, 'VALIDATION_ERROR', 'request body must be a JSON object');
    if (version === 'v2') {
      if (typeof body.device_name !== 'string' || !/^[A-Za-z0-9]+$/.test(body.device_name)) {
        return error(400, 'VALIDATION_ERROR', 'device_name is required and must be Latin letters and digits');
      }
    }
    if (!isPositiveNumber(body.amount)) {
      return error(400, 'VALIDATION_ERROR', 'amount is required and must be a positive number');
    }
    if (kind === 'payment' && (typeof body.payer_phone !== 'string' || body.payer_phone === '')) {
      return error(400, 'VALIDATION_ERROR', 'payer_phone and amount are required');
    }
    if (version === 'v2' && env === 'sandbox' && body.device_name.toLowerCase() !== 'test') {
      return error(404, 'DEVICE_NOT_FOUND', 'no active device of yours has this device_name');
    }
    return null;
  }

  function createRoute(version, env, req, body, kind) {
    const invalid = validateCreate(version, env, body, kind);
    if (invalid) return invalid;
    const idemKey = req.headers['x-idempotency-key'];
    const slot = idemKey ? `${version}|${kind}|${idemKey}` : null;
    if (slot && idempotent.has(slot)) return idempotent.get(slot);

    const p = createPayment(version, env, body, kind);
    let result;
    if (kind === 'link') {
      const opId = 14000000000 + Math.floor(Math.random() * 999999999);
      result = {
        status: 200,
        body: {
          payment_id: p.payment_id,
          qr_token: `https://qr.kaspi.kz/${opId}${Math.floor(Math.random() * 1e12)}`,
          qr_operation_id: opId,
          ext_tran_id: `QR${opId}`,
          status: 'QrTokenCreated',
          expire_date: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          environment: env,
        },
        payment_id: p.payment_id,
      };
    } else {
      result = { status: 201, body: publicPayment(p), payment_id: p.payment_id };
    }
    if (slot) idempotent.set(slot, result);
    return result;
  }

  function refundRoute(env, p, body) {
    if (!isObject(body) || !isPositiveNumber(body.amount)) {
      return error(400, 'VALIDATION_ERROR', 'amount is required and must be a positive number');
    }
    if (p.status !== 'COMPLETED' && p.status !== 'PARTIALLY_REFUNDED') {
      return error(409, 'REFUND_NOT_ALLOWED', `a payment in status ${p.status} cannot be refunded`);
    }
    if (body.amount > p.amount - p.refunded) {
      return error(400, 'VALIDATION_ERROR', 'amount is greater than what is left to refund');
    }
    p.refunded += body.amount;
    touch(p, p.refunded >= p.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED');
    const t = nowIso();
    const refund = {
      refund_id: crypto.randomUUID(),
      payment_id: p.payment_id,
      user_id: FAKE_USER_ID,
      amount: body.amount,
      status: 'PENDING',
      environment: env,
      created_at: t,
      updated_at: t,
    };
    if (typeof body.reason === 'string' && body.reason !== '') refund.reason = body.reason;
    refunds.push(refund);
    return { status: 202, body: refund, payment_id: p.payment_id };
  }

  function apiRoute(version, rest, req, body) {
    const env = authorize(version, bearer(req.headers.authorization));
    if (!env) {
      return error(401, 'UNAUTHORIZED', `a valid ${version === 'v2' ? 'xapi_' : 'xdev_'} key is required on /${version}`);
    }
    const method = req.method;
    let m;
    if (method === 'POST' && rest === '/payments/link') return createRoute(version, env, req, body, 'link');
    if (method === 'POST' && rest === '/payments') return createRoute(version, env, req, body, 'payment');
    if (method === 'GET' && (m = /^\/payments\/([^/]+)$/.exec(rest))) {
      const p = payments.get(decodeURIComponent(m[1]));
      if (!p) return error(404, 'PAYMENT_NOT_FOUND', 'payment not found');
      return { status: 200, body: publicPayment(p), payment_id: p.payment_id };
    }
    if (method === 'POST' && (m = /^\/payments\/([^/]+)\/refund$/.exec(rest))) {
      const p = payments.get(decodeURIComponent(m[1]));
      if (!p) return error(404, 'PAYMENT_NOT_FOUND', 'payment not found');
      return refundRoute(env, p, body);
    }
    if (version === 'v2' && method === 'GET' && rest === '/devices') {
      const devices =
        env === 'sandbox'
          ? [{ device_name: 'test', name: 'Test cashbox', is_active: true, session_problem_since: null }]
          : [{ device_name: 'Kassa1', name: 'Main cashbox', is_active: true, session_problem_since: null }];
      return { status: 200, body: { devices } };
    }
    return error(404, 'NOT_FOUND', `${method} /${version}${rest} is not an endpoint of the fake`);
  }

  function controlRoute(req, url, body) {
    const method = req.method;
    let m;
    if (url.pathname === '/__requests' && method === 'GET') return { status: 200, body: log };
    if (url.pathname === '/__requests' && method === 'DELETE') {
      log = [];
      return { status: 200, body: { ok: true } };
    }
    if (url.pathname === '/__payments' && method === 'GET') {
      return { status: 200, body: [...payments.values()].map(publicPayment) };
    }
    if (url.pathname === '/__reset' && method === 'POST') {
      log = [];
      payments.clear();
      refunds.length = 0;
      idempotent.clear();
      return { status: 200, body: { ok: true } };
    }
    if ((m = /^\/__pay\/([^/]+)$/.exec(url.pathname)) && method === 'POST') {
      const p = payments.get(decodeURIComponent(m[1]));
      if (!p) return error(404, 'PAYMENT_NOT_FOUND', 'payment not found');
      const outcome = isObject(body) && typeof body.outcome === 'string' ? body.outcome : 'paid';
      if (!(outcome in OUTCOMES)) return error(400, 'VALIDATION_ERROR', `outcome must be one of ${Object.keys(OUTCOMES).join(', ')}`);
      touch(p, OUTCOMES[outcome]);
      return { status: 200, body: publicPayment(p) };
    }
    return error(404, 'NOT_FOUND', 'unknown helper');
  }

  const server = http.createServer(async (req, res) => {
    let raw = '';
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(413).end();
      return;
    }
    const url = new URL(req.url, 'http://fake');
    const body = parseBody(raw);
    let result;
    if (url.pathname.startsWith('/__')) {
      result = controlRoute(req, url, body);
    } else {
      const entry = {
        seq: ++seq,
        method: req.method,
        path: url.pathname,
        auth: authPrefix(req.headers.authorization),
        idempotency_key: req.headers['x-idempotency-key'] ?? null,
        body,
      };
      if (url.search) entry.query = url.search;
      log.push(entry);
      const m = /^\/(v1|v2)(\/.*)$/.exec(url.pathname);
      result = m ? apiRoute(m[1], m[2], req, body) : error(404, 'NOT_FOUND', 'unknown path');
      entry.status = result.status;
      const pid = result.payment_id ?? /^\/v[12]\/payments\/([^/]+)/.exec(url.pathname)?.[1];
      if (pid) entry.payment_id = pid;
    }
    const text = JSON.stringify(result.body);
    res.writeHead(result.status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const actualPort = server.address().port;
  return {
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : 4010;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('usage: node tests/fake-xpayment/server.mjs --port N');
    process.exit(2);
  }
  const fake = await startFake({ port });
  console.log(`fake-xpayment listening on ${fake.url}`);
  const stop = () => fake.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
