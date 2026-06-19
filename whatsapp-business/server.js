#!/usr/bin/env node
import http from 'node:http';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDraftStore, ensureDraftStore } from '../src/draft-store.js';
import { createGroupStore } from '../src/group-store.js';
import { createWebhookEventStore } from '../src/webhook-event-store.js';
import {
  validateWebhookPayload,
  verifyChallenge,
  verifyMetaSignature,
  WebhookVerificationError,
} from './verify-webhook.js';
import { routeWebhookPayloadAsync } from './message-router.js';
import {
  DEFAULT_GRAPH_API_VERSION,
  sendWhatsAppMessage,
} from './send-message.js';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;
export const DEFAULT_WEBHOOK_PATH = '/webhook';
export const MAX_BODY_BYTES = 1024 * 1024;

export function parseArgs(argv) {
  const args = {
    host: process.env.WHATSAPP_BUSINESS_HOST || DEFAULT_HOST,
    port: Number(process.env.WHATSAPP_BUSINESS_PORT || DEFAULT_PORT),
    dryRun: false,
    webhookPath: process.env.WHATSAPP_BUSINESS_WEBHOOK_PATH || DEFAULT_WEBHOOK_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') args.host = readValue(argv, ++index, arg);
    else if (arg === '--port') args.port = Number(readValue(argv, ++index, arg));
    else if (arg === '--webhook-path') args.webhookPath = readValue(argv, ++index, arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown WhatsApp Business server option: ${arg}`);
  }

  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error('--port must be a valid TCP port');
  }
  if (!args.webhookPath.startsWith('/')) {
    throw new Error('--webhook-path must start with /');
  }

  return args;
}

export function usage() {
  return [
    'Usage:',
    '  npm run whatsapp-business',
    '  npm run whatsapp-business:dry-run',
    '',
    'Starts the local WhatsApp Business webhook and interactive draft manager.',
    'Facebook automation remains local and is called only through the guarded posting worker.',
  ].join('\n');
}

export function loadConfig(env = process.env) {
  return {
    accessToken: env.WHATSAPP_CLOUD_ACCESS_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    graphVersion: env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
    allowedUsers: splitCsv(env.WHATSAPP_BUSINESS_ALLOWED_USERS),
    publicUrl: env.WHATSAPP_BUSINESS_PUBLIC_URL || '',
  };
}

export async function runServer({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n\n${usage()}\n`);
    return 2;
  }

  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  const config = loadConfig(env);
  if (args.dryRun) {
    stdout.write(formatDryRun(config, args));
    return 0;
  }

  const server = createWebhookServer({
    config,
    webhookPath: args.webhookPath,
    repoRoot: process.cwd(),
  });
  await listen(server, args.port, args.host);
  stdout.write(`WhatsApp Business webhook server listening on http://${args.host}:${args.port}${args.webhookPath}\n`);
  stdout.write('Safety: dry-run first; live worker calls require a reviewed draft and explicit POST.\n');
  return 0;
}

export function createWebhookServer({
  config = loadConfig(),
  webhookPath = DEFAULT_WEBHOOK_PATH,
  repoRoot = process.cwd(),
  draftStore = createDraftStore({ repoRoot }),
  groupStore = createGroupStore({ repoRoot }),
  eventStore = createWebhookEventStore({ repoRoot }),
  fetchImpl = globalThis.fetch,
  sendMessageImpl = sendWhatsAppMessage,
  runCommand,
  now,
  stderr = process.stderr,
} = {}) {
  ensureDraftStore(draftStore);
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.pathname !== webhookPath) {
        sendJson(response, 404, { ok: false, error: 'Unknown route' });
        return;
      }

      if (request.method === 'GET') {
        handleVerificationRequest(url, response, config);
        return;
      }

      if (request.method === 'POST') {
        await handleWebhookPost(request, response, config, {
          draftStore,
          groupStore,
          eventStore,
          repoRoot,
          fetchImpl,
          sendMessageImpl,
          runCommand,
          now,
          stderr,
        });
        return;
      }

      sendJson(response, 405, { ok: false, error: 'Method not allowed' }, { Allow: 'GET, POST' });
    } catch (error) {
      handleError(response, error);
    }
  });
}

export function handleVerificationRequest(url, response, config) {
  const challenge = verifyChallenge(url.searchParams, config.verifyToken);
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(challenge);
}

export async function handleWebhookPost(request, response, config, runtime = {}) {
  const rawBody = await readRequestBody(request, MAX_BODY_BYTES);
  verifyMetaSignature(rawBody, request.headers['x-hub-signature-256'], config.appSecret);

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    throw new WebhookVerificationError('Malformed webhook body: invalid JSON', 400);
  }

  validateWebhookPayload(payload);
  const result = await routeWebhookPayloadAsync(payload, {
    allowedUsers: config.allowedUsers,
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
    graphVersion: config.graphVersion,
    draftStore: runtime.draftStore,
    groupStore: runtime.groupStore,
    eventStore: runtime.eventStore,
    repoRoot: runtime.repoRoot,
    fetchImpl: runtime.fetchImpl,
    runCommand: runtime.runCommand,
    now: runtime.now,
  });
  const deliveries = await deliverResponses(result.responses, config, runtime);
  if (deliveries.length > 0) result.deliveries = deliveries;
  const statusCode = result.statusCode || 200;
  delete result.statusCode;
  sendJson(response, statusCode, result);
}

export async function deliverResponses(responses, config, {
  fetchImpl = globalThis.fetch,
  sendMessageImpl = sendWhatsAppMessage,
  stderr = process.stderr,
} = {}) {
  if (!Array.isArray(responses) || responses.length === 0) return [];
  if (!config.accessToken || !config.phoneNumberId) {
    return responses.map(() => ({
      ok: false,
      skipped: true,
      error: 'WhatsApp outbound credentials are not configured',
    }));
  }

  const deliveries = [];
  for (const payload of responses) {
    try {
      const apiResult = await sendMessageImpl(payload, {
        accessToken: config.accessToken,
        phoneNumberId: config.phoneNumberId,
        graphVersion: config.graphVersion,
        fetchImpl,
      });
      deliveries.push({
        ok: true,
        messageId: apiResult?.messages?.[0]?.id || null,
      });
    } catch (error) {
      stderr?.write?.(`WhatsApp reply failed: ${error.message}\n`);
      deliveries.push({
        ok: false,
        error: error.message,
      });
    }
  }
  return deliveries;
}

export function readRequestBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new WebhookVerificationError('Webhook body is too large', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function formatDryRun(config, args) {
  return [
    'WhatsApp Business webhook server dry-run OK.',
    `Host: ${args.host}`,
    `Port: ${args.port}`,
    `Webhook path: ${args.webhookPath}`,
    `Verify token configured: ${config.verifyToken ? 'yes' : 'no'}`,
    `App secret configured: ${config.appSecret ? 'yes' : 'no'}`,
    `Cloud access token configured: ${config.accessToken ? 'yes' : 'no'}`,
    `Phone number ID configured: ${config.phoneNumberId ? 'yes' : 'no'}`,
    `Graph API version: ${config.graphVersion}`,
    `Allowed users configured: ${config.allowedUsers.length}`,
    `Public URL configured: ${config.publicUrl ? 'yes' : 'no'}`,
    'Safety: no worker, OpenCLI, Browser Bridge, or Facebook automation calls are made.',
    '',
  ].join('\n');
}

export function sendJson(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

export function handleError(response, error) {
  const statusCode = error instanceof WebhookVerificationError ? error.statusCode : 500;
  sendJson(response, statusCode, {
    ok: false,
    error: error.message || 'Internal server error',
  });
}

export function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function splitCsv(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function isMain(metaUrl) {
  return fileURLToPath(metaUrl) === process.argv[1];
}

if (isMain(import.meta.url)) {
  const status = await runServer();
  process.exitCode = status;
}
