import crypto from 'node:crypto';

export class WebhookVerificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'WebhookVerificationError';
    this.statusCode = statusCode;
  }
}

export function verifyChallenge(query, expectedToken) {
  if (!expectedToken) {
    throw new WebhookVerificationError('WHATSAPP_VERIFY_TOKEN is not configured', 500);
  }

  const mode = query.get('hub.mode');
  const token = query.get('hub.verify_token');
  const challenge = query.get('hub.challenge');

  if (!mode || !token || !challenge) {
    throw new WebhookVerificationError('Missing webhook verification parameters', 400);
  }
  if (mode !== 'subscribe') {
    throw new WebhookVerificationError('Unsupported webhook verification mode', 400);
  }
  if (token !== expectedToken) {
    throw new WebhookVerificationError('Webhook verify token did not match', 403);
  }

  return challenge;
}

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true;
  if (!signatureHeader) {
    throw new WebhookVerificationError('Missing webhook signature', 401);
  }

  const match = /^sha256=([a-f0-9]{64})$/i.exec(signatureHeader.trim());
  if (!match) {
    throw new WebhookVerificationError('Invalid webhook signature format', 401);
  }

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const actual = match[1].toLowerCase();

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new WebhookVerificationError('Webhook signature did not match', 401);
  }

  return true;
}

export function validateWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new WebhookVerificationError('Malformed webhook body: expected an object', 400);
  }
  if (payload.object !== 'whatsapp_business_account') {
    throw new WebhookVerificationError('Malformed webhook body: expected whatsapp_business_account object', 400);
  }
  if (!Array.isArray(payload.entry)) {
    throw new WebhookVerificationError('Malformed webhook body: expected entry array', 400);
  }

  return true;
}
