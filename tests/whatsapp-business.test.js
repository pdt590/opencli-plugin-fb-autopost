import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDraftStore,
  getDraft,
  updateDraft,
} from '../src/draft-store.js';
import {
  addGroup,
  createGroupStore,
  listGroups,
} from '../src/group-store.js';
import {
  createWebhookEventStore,
  readProcessedMessages,
} from '../src/webhook-event-store.js';
import {
  createWebhookServer,
  runServer,
} from '../whatsapp-business/server.js';
import {
  decodeActionId,
  encodeActionId,
  parseTextFallback,
  renderMenu,
  renderTextFallback,
} from '../whatsapp-business/interactive-menus.js';
import {
  normalizeIncomingMessage,
  routeWebhookPayload,
  routeWebhookPayloadAsync,
} from '../whatsapp-business/message-router.js';
import {
  downloadWhatsAppImage,
  extensionForMedia,
  extractImageMediaId,
  validateLocalImageFile,
} from '../whatsapp-business/media-download.js';
import {
  buildTextMessage,
  sendWhatsAppMessage,
} from '../whatsapp-business/send-message.js';
import {
  verifyChallenge,
  verifyMetaSignature,
  WebhookVerificationError,
} from '../whatsapp-business/verify-webhook.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-whatsapp-business-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WhatsApp Business webhook verification helpers', () => {
  it('returns the challenge when the verify token matches', () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'expected-token',
      'hub.challenge': 'challenge-value',
    });

    expect(verifyChallenge(params, 'expected-token')).toBe('challenge-value');
  });

  it('fails clearly when the verify token is missing or wrong', () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge-value',
    });

    expect(() => verifyChallenge(params, '')).toThrow(WebhookVerificationError);
    expect(() => verifyChallenge(params, 'expected-token')).toThrow('Webhook verify token did not match');
  });

  it('verifies x-hub-signature-256 style signatures when an app secret is configured', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const secret = 'test-app-secret';
    const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');

    expect(verifyMetaSignature(body, `sha256=${digest}`, secret)).toBe(true);
    expect(() => verifyMetaSignature(body, `sha256=${'0'.repeat(64)}`, secret)).toThrow(
      'Webhook signature did not match',
    );
  });
});

describe('WhatsApp Business webhook server', () => {
  it('starts locally and verifies webhook challenges on the configured route', async () => {
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '' },
    });

    const response = await dispatch(server, {
      path: '/webhook?hub.mode=subscribe&hub.verify_token=expected-token&hub.challenge=abc123',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('abc123');
  });

  it('rejects webhook challenges when token config or request token is invalid', async () => {
    const missingConfigServer = createWebhookServer({
      config: { verifyToken: '', appSecret: '' },
    });
    const wrongTokenServer = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '' },
    });

    const missingConfig = await dispatch(missingConfigServer, {
      path: '/webhook?hub.mode=subscribe&hub.verify_token=expected-token&hub.challenge=abc123',
    });
    const wrongToken = await dispatch(wrongTokenServer, {
      path: '/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=abc123',
    });

    expect(missingConfig.statusCode).toBe(500);
    expect(JSON.parse(missingConfig.body)).toMatchObject({
      ok: false,
      error: 'WHATSAPP_VERIFY_TOKEN is not configured',
    });
    expect(wrongToken.statusCode).toBe(403);
    expect(JSON.parse(wrongToken.body)).toMatchObject({
      ok: false,
      error: 'Webhook verify token did not match',
    });
  });

  it('accepts valid JSON webhook POST bodies without calling worker or OpenCLI code', async () => {
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '' },
    });

    const response = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body: JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [],
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      received: true,
      actions: [],
      responses: [],
    });
  });

  it('rejects malformed JSON and malformed webhook object bodies', async () => {
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '' },
    });

    const invalidJson = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body: '{bad json',
    });
    const invalidShape = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body: JSON.stringify({ object: 'not_whatsapp', entry: [] }),
    });

    expect(invalidJson.statusCode).toBe(400);
    expect(JSON.parse(invalidJson.body).error).toBe('Malformed webhook body: invalid JSON');
    expect(invalidShape.statusCode).toBe(400);
    expect(JSON.parse(invalidShape.body).error).toBe(
      'Malformed webhook body: expected whatsapp_business_account object',
    );
  });

  it('rejects POST bodies without a valid signature when WHATSAPP_APP_SECRET is configured', async () => {
    const appSecret = 'test-app-secret';
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
    });
    const digest = crypto.createHmac('sha256', appSecret).update(body).digest('hex');
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret },
    });

    const missingSignature = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body,
    });
    const validSignature = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      headers: {
        'x-hub-signature-256': `sha256=${digest}`,
      },
      body,
    });

    expect(missingSignature.statusCode).toBe(401);
    expect(JSON.parse(missingSignature.body).error).toBe('Missing webhook signature');
    expect(validSignature.statusCode).toBe(200);
  });

  it('rejects unknown routes', async () => {
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '' },
    });

    const response = await dispatch(server, {
      method: 'POST',
      path: '/unknown',
      body: JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [],
      }),
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      error: 'Unknown route',
    });
  });

  it('supports dry-run startup output without printing secret values', async () => {
    const output = createOutput();
    const status = await runServer({
      argv: ['--dry-run'],
      env: {
        WHATSAPP_VERIFY_TOKEN: 'super-secret-verify-token',
        WHATSAPP_APP_SECRET: 'super-secret-app-secret',
        WHATSAPP_CLOUD_ACCESS_TOKEN: 'super-secret-cloud-token',
        WHATSAPP_PHONE_NUMBER_ID: '123456789',
        WHATSAPP_BUSINESS_ALLOWED_USERS: '601111111111,601222222222',
        WHATSAPP_BUSINESS_PUBLIC_URL: 'https://example.test/webhook',
      },
      stdout: output,
      stderr: output,
    });

    expect(status).toBe(0);
    expect(output.text()).toContain('WhatsApp Business webhook server dry-run OK');
    expect(output.text()).toContain('Verify token configured: yes');
    expect(output.text()).toContain('Allowed users configured: 2');
    expect(output.text()).not.toContain('super-secret');
    expect(output.text()).not.toContain('601111111111');
    expect(output.text()).not.toContain('https://example.test');
  });

  it('documents package scripts and safety scope', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    const docs = fs.readFileSync(path.resolve('docs/whatsapp-business-setup.md'), 'utf8');
    const serverSource = fs.readFileSync(path.resolve('whatsapp-business/server.js'), 'utf8');

    expect(packageJson.scripts['whatsapp-business']).toBe('node whatsapp-business/server.js');
    expect(packageJson.scripts['whatsapp-business:dry-run']).toBe('node whatsapp-business/server.js --dry-run');
    expect(docs).toContain('WHATSAPP_VERIFY_TOKEN');
    expect(docs).toContain('does not post to Facebook');
    expect(docs).toContain('does not automate the browser');
    expect(docs).toContain('verify against official Meta docs before production use');
    expect(serverSource).not.toContain('posting-worker');
    expect(serverSource).not.toContain('child_process');
  });
});

describe('WhatsApp Business outbound replies', () => {
  it('sends a message through the configured Graph API version without exposing the token', async () => {
    const calls = [];
    const result = await sendWhatsAppMessage(buildTextMessage({
      to: '601111111111',
      text: 'Main Menu',
    }), {
      accessToken: 'test-access-token',
      phoneNumberId: 'phone-id',
      graphVersion: 'v25.0',
      async fetchImpl(url, options) {
        calls.push({ url, options });
        return jsonResponse({
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.outbound' }],
        });
      },
    });

    expect(result.messages[0].id).toBe('wamid.outbound');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://graph.facebook.com/v25.0/phone-id/messages');
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers.authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(calls[0].options.body)).toMatchObject({
      messaging_product: 'whatsapp',
      to: '601111111111',
      type: 'text',
    });
    expect(JSON.stringify(result)).not.toContain('test-access-token');
  });

  it('delivers routed responses through Meta when credentials are configured', async () => {
    const sent = [];
    const draftStore = createDraftStore({ repoRoot: tmpDir });
    const groupStore = createGroupStore({ repoRoot: tmpDir });
    addGroup(groupStore, {
      alias: 'main',
      url: 'https://www.facebook.com/groups/12345',
      approvedForPosting: true,
    });
    const server = createWebhookServer({
      repoRoot: tmpDir,
      draftStore,
      groupStore,
      config: {
        verifyToken: 'expected-token',
        appSecret: '',
        accessToken: 'test-access-token',
        phoneNumberId: 'phone-id',
        graphVersion: 'v25.0',
        allowedUsers: ['601111111111'],
      },
      async sendMessageImpl(payload, options) {
        sent.push({ payload, options });
        return { messages: [{ id: 'wamid.reply' }] };
      },
    });

    const response = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body: JSON.stringify(sampleWebhookPayload({
        message: {
          id: 'wamid.menu',
          from: '601111111111',
          type: 'text',
          text: { body: 'MENU' },
        },
      })),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({
      to: '601111111111',
      type: 'interactive',
    });
    expect(sent[0].options).toMatchObject({
      accessToken: 'test-access-token',
      phoneNumberId: 'phone-id',
      graphVersion: 'v25.0',
    });
    expect(body.deliveries).toEqual([{
      ok: true,
      messageId: 'wamid.reply',
    }]);
  });

  it('ignores a repeated webhook message ID without sending a duplicate reply', async () => {
    const draftStore = createDraftStore({ repoRoot: tmpDir });
    const groupStore = createGroupStore({ repoRoot: tmpDir });
    const eventStore = createWebhookEventStore({ repoRoot: tmpDir });
    const payload = textPayload('MENU');
    const options = {
      draftStore,
      groupStore,
      eventStore,
    };

    const first = await routeWebhookPayloadAsync(payload, options);
    const repeated = await routeWebhookPayloadAsync(payload, options);

    expect(first.responses).toHaveLength(1);
    expect(repeated.responses).toEqual([]);
    expect(repeated.actions[0]).toMatchObject({
      type: 'ignored_duplicate',
      messageId: payload.entry[0].changes[0].value.messages[0].id,
    });
    expect(readProcessedMessages(eventStore)).toEqual([
      payload.entry[0].changes[0].value.messages[0].id,
    ]);
  });
});

describe('WhatsApp Business interactive menu rendering', () => {
  it('renders Main Menu as a list payload with text fallback', () => {
    const payload = renderMenu('main', { to: '601111111111' });

    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '601111111111',
      type: 'interactive',
      interactive: {
        type: 'list',
      },
    });
    const body = payload.interactive.body.text;
    expect(body).toContain('Main Menu');
    expect(body).toContain('Reply 1=New Post');
    expect(payload.interactive.action.sections[0].rows.map((row) => row.title)).toEqual([
      'New Post',
      'Drafts',
      'Groups',
      'Settings',
      'Help',
    ]);
  });

  it('renders New Post as reply buttons with fallback numbering', () => {
    const payload = renderMenu('new_post', { to: '601111111111' });

    expect(payload).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'button',
      },
    });
    expect(payload.interactive.body.text).toContain('Reply 1=Use Existing Group');
    expect(payload.interactive.action.buttons.map((button) => button.reply.title)).toEqual([
      'Use Existing Group',
      'Add New Group URL',
      'Cancel',
    ]);
  });

  it('renders Drafts, Groups, Settings, Help placeholders and plain text fallback', () => {
    for (const menu of ['drafts', 'groups', 'settings', 'help']) {
      const payload = renderMenu(menu, { to: '601111111111' });
      expect(payload.messaging_product).toBe('whatsapp');
      expect(payload.type).toBe('interactive');
      expect(payload.interactive.body.text).toContain('Reply 1=');
    }

    const fallback = renderTextFallback('main', { to: '601111111111' });
    expect(fallback).toMatchObject({
      type: 'text',
      text: {
        body: expect.stringContaining('Reply 1=New Post'),
      },
    });
  });
});

describe('WhatsApp Business incoming action routing', () => {
  it('parses button replies into normalized internal actions', () => {
    const normalized = normalizeIncomingMessage({
      id: 'wamid.button',
      from: '601111111111',
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: encodeActionId('new_post'),
          title: 'New Post',
        },
      },
    });

    expect(normalized).toEqual({
      type: 'menu_action',
      action: 'new_post',
      conversationId: '601111111111',
      userPhone: '601111111111',
      messageId: 'wamid.button',
    });
    expect(decodeActionId('action:new-post')).toBe('new_post');
  });

  it('parses list replies into normalized internal actions', () => {
    const normalized = normalizeIncomingMessage({
      id: 'wamid.list',
      from: '601111111111',
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: encodeActionId('groups'),
          title: 'Groups',
        },
      },
    });

    expect(normalized.action).toBe('groups');
    expect(normalized.type).toBe('menu_action');
  });

  it('parses numbered text fallback using the current menu context', () => {
    expect(parseTextFallback('1', 'main')).toBe('new_post');
    expect(parseTextFallback('2', 'main')).toBe('drafts');
    expect(parseTextFallback('2', 'new_post')).toBe('add_group_url');
    expect(parseTextFallback('DRY RUN', 'main')).toBe('dry_run');
    expect(parseTextFallback('POST', 'main')).toBe('post');
    expect(parseTextFallback('999', 'main')).toBeNull();
  });

  it('routes unknown actions and unsupported payloads to Help/Menu response', () => {
    const result = routeWebhookPayload(sampleWebhookPayload({
      message: {
        id: 'wamid.unknown',
        from: '601111111111',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: 'action:not_real',
            title: 'Not Real',
          },
        },
      },
    }));

    expect(result.statusCode).toBe(200);
    expect(result.actions[0]).toMatchObject({
      type: 'unsupported_payload',
      action: 'show_help',
      reason: 'unsupported_payload',
    });
    expect(result.responses[0].interactive.body.text).toContain('Help');
  });

  it('rejects unknown users when an allowed-user list is configured', () => {
    const result = routeWebhookPayload(
      sampleWebhookPayload({
        message: {
          id: 'wamid.blocked',
          from: '601999999999',
          type: 'text',
          text: {
            body: '1',
          },
        },
      }),
      {
        allowedUsers: ['601111111111'],
      },
    );

    expect(result).toMatchObject({
      ok: false,
      rejected: true,
      reason: 'user_not_allowed',
      statusCode: 403,
    });
    expect(result.responses).toEqual([]);
  });

  it('rejects POST because live confirmation is not enabled', () => {
    const result = routeWebhookPayload(sampleWebhookPayload({
      message: {
        id: 'wamid.post',
        from: '601111111111',
        type: 'text',
        text: {
          body: 'POST',
        },
      },
    }));

    expect(result.actions[0]).toMatchObject({
      type: 'rejected_action',
      action: 'post',
      reason: 'no_draft_state',
    });
    expect(result.responses[0].interactive.body.text).toContain('Help');
  });

  it('collects approved group, caption, images, and DONE into a ready dry-run draft', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-18T12:00:00.000Z'),
    });
    const groupStore = createGroupStore({ repoRoot: tmpDir });
    addGroup(groupStore, {
      alias: 'main',
      label: 'Main Group',
      url: 'https://www.facebook.com/groups/12345',
      approvedForPosting: true,
    });
    const options = {
      draftStore,
      groupStore,
      accessToken: 'test-access-token',
      phoneNumberId: 'phone-id',
      graphVersion: 'v25.0',
      fetchImpl: async (url) => {
        if (url.startsWith('https://graph.facebook.com/')) {
          return jsonResponse({
            id: 'media-1',
            mime_type: 'image/jpeg',
            url: 'https://lookaside.fbsbx.com/whatsapp/media-1',
          });
        }
        return binaryResponse('fake-jpeg');
      },
    };

    const started = await routeWebhookPayloadAsync(textPayload('NEW POST'), options);
    expect(started.actions[0]).toMatchObject({
      action: 'new_post',
      draftStatus: 'collecting_group',
    });
    expect(started.responses[0].text.body).toContain('- main: Main Group');

    const selected = await routeWebhookPayloadAsync(textPayload('main'), options);
    expect(selected.actions[0]).toMatchObject({
      action: 'text_input',
      draftStatus: 'collecting_caption',
      groupAlias: 'main',
    });

    const captioned = await routeWebhookPayloadAsync(textPayload('Caption from WhatsApp'), options);
    expect(captioned.actions[0]).toMatchObject({
      draftStatus: 'collecting_images',
    });

    const imaged = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.image-flow',
        from: '601111111111',
        type: 'image',
        image: {
          id: 'media-1',
          mime_type: 'image/jpeg',
        },
      },
    }), options);
    expect(imaged.actions[0]).toMatchObject({
      action: 'image_upload',
      imageCount: 1,
      draftStatus: 'collecting_images',
    });

    const done = await routeWebhookPayloadAsync(textPayload('DONE'), options);
    expect(done.actions[0]).toMatchObject({
      action: 'done',
      draftStatus: 'ready_for_dry_run',
      imageCount: 1,
    });
    expect(done.responses[0].text.body).toContain('Reply DRY RUN');

    const draft = getDraft(draftStore, started.actions[0].draftId);
    expect(draft).toMatchObject({
      groupAlias: 'main',
      caption: 'Caption from WhatsApp',
      status: 'ready_for_dry_run',
    });
    expect(draft.localImagePaths).toHaveLength(1);
  });

  it('requires explicit APPROVE GROUP before storing a new group URL', async () => {
    const draftStore = createDraftStore({ repoRoot: tmpDir });
    const groupStore = createGroupStore({ repoRoot: tmpDir });
    const options = { draftStore, groupStore };

    const started = await routeWebhookPayloadAsync(textPayload('NEW POST'), options);
    const proposed = await routeWebhookPayloadAsync(
      textPayload('https://www.facebook.com/groups/987654321'),
      options,
    );

    expect(proposed.actions[0]).toMatchObject({
      action: 'text_input',
      draftStatus: 'collecting_group',
      pendingGroupAlias: 'group-987654321',
    });
    expect(proposed.responses[0].text.body).toContain('Reply APPROVE GROUP');
    expect(listGroups(groupStore)).toEqual([]);

    const approved = await routeWebhookPayloadAsync(textPayload('APPROVE GROUP'), options);
    expect(approved.actions[0]).toMatchObject({
      action: 'approve_group',
      draftId: started.actions[0].draftId,
      draftStatus: 'collecting_caption',
      groupAlias: 'group-987654321',
    });
    expect(listGroups(groupStore)[0]).toMatchObject({
      alias: 'group-987654321',
      approvedForPosting: true,
    });
  });

  it('routes DRY RUN through the local worker dry-run path and returns status plus screenshot', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await readyImageDraft(draftStore, { conversationId: '601111111111' });
    const localImagePath = path.join(tmpDir, 'photo-1.jpg');
    updateDraft(draftStore, draft.draftId, (current) => ({
      ...current,
      localImagePaths: [localImagePath],
      whatsappMediaIds: ['media-1'],
      status: 'ready_for_dry_run',
    }));
    const calls = [];

    const result = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.dry-run',
        from: '601111111111',
        type: 'text',
        text: {
          body: 'DRY RUN',
        },
      },
    }), {
      draftStore,
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand(command, args, options) {
        calls.push({ command, args, options });
        return {
          status: 0,
          output: JSON.stringify({
            ok: true,
            status: 'dry-run-ready',
            mode: 'dry-run',
            message: 'Composer prepared for review.',
            screenshot: './artifacts/facebook-group-post/dry-run.png',
          }),
        };
      },
    });

    expect(result.actions[0]).toMatchObject({
      type: 'menu_action',
      action: 'dry_run',
      draftId: draft.draftId,
      draftStatus: 'dry_run_ready',
      workerStatus: 'dry-run-ready',
      screenshot: './artifacts/facebook-group-post/dry-run.png',
      ok: true,
    });
    expect(result.responses[0].text.body).toContain('Dry-run ready.');
    expect(result.responses[0].text.body).toContain('Status: dry-run-ready');
    expect(result.responses[0].text.body).toContain('Screenshot: ./artifacts/facebook-group-post/dry-run.png');
    expect(result.responses[0].text.body).toContain('Reply POST to publish or CANCEL to discard');
    expect(calls[0]).toEqual({
      command: 'node',
      args: [
        'worker/posting-worker.js',
        '--job',
        path.join('artifacts', 'whatsapp-business', 'jobs', `${draft.draftId}.dry-run.json`),
      ],
      options: { cwd: tmpDir },
    });
    expect(calls[0].args).not.toContain('--confirm');
    expect(JSON.stringify(JSON.parse(fs.readFileSync(path.join(
      tmpDir,
      'artifacts',
      'whatsapp-business',
      'jobs',
      `${draft.draftId}.dry-run.json`,
    ), 'utf8')))).not.toContain('confirm');
    expect(getDraft(draftStore, draft.draftId)).toMatchObject({
      status: 'dry_run_ready',
      dryRunScreenshotPath: './artifacts/facebook-group-post/dry-run.png',
    });
  });

  it('routes POST through the local live worker only for one dry-run-ready draft', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await dryRunReadyDraft(draftStore, { conversationId: '601111111111' });
    const calls = [];

    const result = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.post-live',
        from: '601111111111',
        type: 'text',
        text: {
          body: 'POST',
        },
      },
    }), {
      draftStore,
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand(command, args, options) {
        calls.push({ command, args, options });
        return {
          status: 0,
          output: JSON.stringify({
            ok: true,
            status: 'posted',
            mode: 'live',
            message: 'Posted.',
            screenshot: './artifacts/facebook-group-post/post.png',
          }),
        };
      },
    });

    expect(result.actions[0]).toMatchObject({
      type: 'menu_action',
      action: 'post',
      draftId: draft.draftId,
      draftStatus: 'posted',
      workerStatus: 'posted',
      mappedStatus: 'posted',
      screenshot: './artifacts/facebook-group-post/post.png',
      ok: true,
    });
    expect(result.responses[0].text.body).toContain('Post command finished.');
    expect(result.responses[0].text.body).toContain('Status: posted');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      command: 'node',
      args: [
        'worker/posting-worker.js',
        '--job',
        path.join('artifacts', 'whatsapp-business', 'jobs', `${draft.draftId}.live.json`),
        '--confirm',
        'true',
      ],
      options: { cwd: tmpDir },
    });
    expect(calls[0].args.filter((arg) => arg === '--confirm')).toHaveLength(1);
    const liveJob = JSON.parse(fs.readFileSync(path.join(
      tmpDir,
      'artifacts',
      'whatsapp-business',
      'jobs',
      `${draft.draftId}.live.json`,
    ), 'utf8'));
    expect(liveJob).toMatchObject({
      mode: 'live',
      groupAlias: 'main',
      caption: 'Caption text',
    });
  });

  it('rejects POST without a valid dry-run, valid token, same user, and screenshot', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const calls = [];
    const runCommand = () => {
      calls.push('called');
      throw new Error('live worker must not be called');
    };

    const noDraft = await routeWebhookPayloadAsync(postPayload('601111111111'), {
      draftStore,
      repoRoot: tmpDir,
      runCommand,
    });
    expect(noDraft.actions[0]).toMatchObject({
      type: 'rejected_action',
      action: 'post',
      reason: 'no_dry_run_ready_draft',
    });

    const draft = await dryRunReadyDraft(draftStore, { conversationId: '601111111111' });
    updateDraft(draftStore, draft.draftId, (current) => ({
      ...current,
      confirmationToken: null,
    }));
    const missingToken = await routeWebhookPayloadAsync(postPayload('601111111111'), {
      draftStore,
      repoRoot: tmpDir,
      runCommand,
    });
    expect(missingToken.actions[0]).toMatchObject({
      type: 'rejected_action',
      reason: 'post_rejected',
      message: 'POST requires a valid dry-run confirmation token',
    });

    const expired = await dryRunReadyDraft(draftStore, { conversationId: '601222222222' });
    updateDraft(draftStore, expired.draftId, (current) => ({
      ...current,
      confirmationExpiresAt: '2026-06-17T12:29:59.000Z',
    }));
    const expiredToken = await routeWebhookPayloadAsync(postPayload('601222222222'), {
      draftStore,
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand,
    });
    expect(expiredToken.actions[0]).toMatchObject({
      type: 'rejected_action',
      reason: 'post_rejected',
      message: 'POST confirmation token has expired',
    });

    const wrongUser = await routeWebhookPayloadAsync(postPayload('601333333333'), {
      draftStore,
      repoRoot: tmpDir,
      runCommand,
    });
    expect(wrongUser.actions[0]).toMatchObject({
      type: 'rejected_action',
      reason: 'no_dry_run_ready_draft',
    });

    const noScreenshot = await dryRunReadyDraft(draftStore, { conversationId: '601444444444' });
    updateDraft(draftStore, noScreenshot.draftId, (current) => ({
      ...current,
      dryRunScreenshotPath: null,
    }));
    const missingScreenshot = await routeWebhookPayloadAsync(postPayload('601444444444'), {
      draftStore,
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand,
    });
    expect(missingScreenshot.actions[0]).toMatchObject({
      type: 'rejected_action',
      reason: 'post_rejected',
      message: 'POST requires a dry-run screenshot path',
    });

    expect(calls).toEqual([]);
  });

  it('rejects POST after a draft edit and when more than one ready draft exists', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const edited = await dryRunReadyDraft(draftStore, { conversationId: '601111111111' });
    updateDraft(draftStore, edited.draftId, (current) => ({
      ...current,
      caption: 'Edited caption',
      status: 'collecting_images',
      confirmationToken: null,
      confirmationExpiresAt: null,
    }));
    const calls = [];

    const afterEdit = await routeWebhookPayloadAsync(postPayload('601111111111'), {
      draftStore,
      repoRoot: tmpDir,
      runCommand() {
        calls.push('called');
        return { status: 0, output: '{}' };
      },
    });
    expect(afterEdit.actions[0]).toMatchObject({
      type: 'rejected_action',
      reason: 'no_dry_run_ready_draft',
    });

    await dryRunReadyDraft(draftStore, { conversationId: '601555555555' });
    await dryRunReadyDraft(draftStore, { conversationId: '601555555555' });
    const ambiguous = await routeWebhookPayloadAsync(postPayload('601555555555'), {
      draftStore,
      repoRoot: tmpDir,
      runCommand() {
        calls.push('called');
        return { status: 0, output: '{}' };
      },
    });
    expect(ambiguous.actions[0]).toMatchObject({
      type: 'rejected_action',
      reason: 'multiple_dry_run_ready_drafts',
    });
    expect(calls).toEqual([]);
  });

  it.each([
    ['pending-review', 'pending_review', true],
    ['failed', 'failed', false],
    ['unknown', 'failed', false],
  ])('routes live worker status %s without retrying', async (workerStatus, mappedStatus, ok) => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await dryRunReadyDraft(draftStore, { conversationId: '601111111111' });
    const calls = [];

    const result = await routeWebhookPayloadAsync(postPayload('601111111111'), {
      draftStore,
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand(command, args, options) {
        calls.push({ command, args, options });
        return {
          status: workerStatus === 'failed' ? 1 : 0,
          output: JSON.stringify({
            ok,
            status: workerStatus,
            mode: 'live',
            message: `Worker returned ${workerStatus}`,
            screenshot: `./artifacts/facebook-group-post/${workerStatus}.png`,
          }),
        };
      },
    });

    expect(result.actions[0]).toMatchObject({
      action: 'post',
      draftId: draft.draftId,
      draftStatus: mappedStatus,
      mappedStatus,
      ok,
    });
    if (!ok) {
      expect(result.responses[0].text.body).toContain('No retry was attempted.');
    }
    expect(calls).toHaveLength(1);
  });

  it('routes CANCEL to cancelled status without calling the worker', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await dryRunReadyDraft(draftStore, { conversationId: '601111111111' });
    const calls = [];

    const result = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.cancel',
        from: '601111111111',
        type: 'text',
        text: {
          body: 'CANCEL',
        },
      },
    }), {
      draftStore,
      repoRoot: tmpDir,
      runCommand() {
        calls.push('called');
        return { status: 0, output: '{}' };
      },
    });

    expect(result.actions[0]).toMatchObject({
      type: 'menu_action',
      action: 'cancel',
      draftId: draft.draftId,
      draftStatus: 'cancelled',
      ok: true,
    });
    expect(result.responses[0].text.body).toContain('Draft cancelled.');
    expect(result.responses[0].text.body).toContain('close or discard it manually');
    expect(getDraft(draftStore, draft.draftId).status).toBe('cancelled');
    expect(calls).toEqual([]);
  });

  it('server POST returns normalized action and menu response for text fallback choices', async () => {
    const draftStore = createDraftStore({ repoRoot: tmpDir });
    const groupStore = createGroupStore({ repoRoot: tmpDir });
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '', allowedUsers: ['601111111111'] },
      repoRoot: tmpDir,
      draftStore,
      groupStore,
    });

    const response = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body: JSON.stringify(sampleWebhookPayload({
        message: {
          id: 'wamid.server',
          from: '601111111111',
          type: 'text',
          text: {
            body: '1',
          },
        },
      })),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.actions[0]).toMatchObject({
      type: 'menu_action',
      action: 'new_post',
      conversationId: '601111111111',
      userPhone: '601111111111',
    });
    expect(body.responses[0].text.body).toContain('New post started.');
  });

  it('server POST rejects unknown users when allowed users are configured', async () => {
    const server = createWebhookServer({
      config: { verifyToken: 'expected-token', appSecret: '', allowedUsers: ['601111111111'] },
    });

    const response = await dispatch(server, {
      method: 'POST',
      path: '/webhook',
      body: JSON.stringify(sampleWebhookPayload({
        message: {
          id: 'wamid.blocked-server',
          from: '601999999999',
          type: 'text',
          text: {
            body: '1',
          },
        },
      })),
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: false,
      rejected: true,
      reason: 'user_not_allowed',
      actions: [],
      responses: [],
    });
  });
});

describe('WhatsApp Business media download handling', () => {
  it('maps supported image MIME types and rejects unsupported media', () => {
    expect(extensionForMedia({ mime_type: 'image/jpeg' })).toBe('.jpg');
    expect(extensionForMedia({ mime_type: 'image/png' })).toBe('.png');
    expect(extensionForMedia({ mime_type: 'image/webp' })).toBe('.webp');
    expect(extensionForMedia({ mime_type: 'image/gif' })).toBe('.gif');
    expect(extensionForMedia({ url: 'https://lookaside.fbsbx.com/media/photo.jpeg' })).toBe('.jpeg');
    expect(() => extensionForMedia({ mime_type: 'video/mp4' })).toThrow('Unsupported WhatsApp image MIME type');
  });

  it('downloads WhatsApp media metadata and binary into local draft media storage', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await readyImageDraft(draftStore, { conversationId: '601111111111' });
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (url.startsWith('https://graph.facebook.com/') && url.includes('/media-1')) {
        return jsonResponse({
          id: 'media-1',
          mime_type: 'image/jpeg',
          url: 'https://lookaside.fbsbx.com/whatsapp/media-1',
        });
      }
      if (url === 'https://lookaside.fbsbx.com/whatsapp/media-1') {
        return binaryResponse('fake-jpeg');
      }
      throw new Error(`unexpected fetch URL ${url}`);
    };

    const result = await downloadWhatsAppImage({
      mediaId: 'media-1',
      draft,
      draftStore,
      accessToken: 'test-access-token',
      phoneNumberId: 'phone-id',
      fetchImpl,
    });

    expect(result).toMatchObject({
      mediaId: 'media-1',
      mimeType: 'image/jpeg',
    });
    expect(result.localPath).toBe(path.join(
      tmpDir,
      'artifacts',
      'whatsapp-business',
      'media',
      '601111111111',
      draft.draftId,
      'media-1.jpg',
    ));
    expect(fs.readFileSync(result.localPath, 'utf8')).toBe('fake-jpeg');
    expect(calls).toHaveLength(2);
    expect(calls[0].options.headers.authorization).toBe('Bearer test-access-token');
    expect(JSON.stringify(result)).not.toContain('test-access-token');
  });

  it('rejects missing media IDs and remote image URLs as worker inputs', async () => {
    expect(extractImageMediaId({
      type: 'image',
      image: {},
    })).toBeNull();
    expect(() => validateLocalImageFile('https://example.com/photo.jpg')).toThrow(
      'Remote image URLs are not allowed as worker inputs',
    );
    await expect(downloadWhatsAppImage({
      mediaId: '',
      draft: { draftId: 'draft-1', conversationId: 'chat-a' },
      draftStore: createDraftStore({ repoRoot: tmpDir }),
      accessToken: 'token',
      fetchImpl: async () => jsonResponse({}),
    })).rejects.toThrow('WhatsApp image media ID is required');
  });

  it('routes image webhook payloads to local paths and draft media IDs when draft is ready for images', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await readyImageDraft(draftStore, { conversationId: '601111111111' });
    updateDraft(draftStore, draft.draftId, (current) => ({
      ...current,
      status: 'collecting_images',
    }));
    const fetchImpl = async (url) => {
      if (url.startsWith('https://graph.facebook.com/') && url.includes('/media-1')) {
        return jsonResponse({
          id: 'media-1',
          mime_type: 'image/png',
          url: 'https://lookaside.fbsbx.com/whatsapp/media-1',
        });
      }
      return binaryResponse('fake-png');
    };

    const result = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.image',
        from: '601111111111',
        type: 'image',
        image: {
          id: 'media-1',
          mime_type: 'image/png',
        },
      },
    }), {
      draftStore,
      accessToken: 'test-access-token',
      phoneNumberId: 'phone-id',
      fetchImpl,
    });

    expect(result.actions[0]).toMatchObject({
      type: 'menu_action',
      action: 'image_upload',
      draftId: draft.draftId,
      draftStatus: 'collecting_images',
      mediaId: 'media-1',
      imageCount: 1,
    });
    expect(JSON.stringify(result.actions[0])).not.toContain('test-access-token');
    expect(fs.existsSync(result.actions[0].localImagePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(draftStore.draftsPath, 'utf8')).drafts[0];
    expect(saved.localImagePaths).toEqual([result.actions[0].localImagePath]);
    expect(saved.whatsappMediaIds).toEqual(['media-1']);
  });

  it('rejects image webhook payloads with missing media IDs', async () => {
    const result = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.image-missing',
        from: '601111111111',
        type: 'image',
        image: {},
      },
    }), {
      draftStore: createDraftStore({ repoRoot: tmpDir }),
      accessToken: 'test-access-token',
    });

    expect(result.actions[0]).toMatchObject({
      type: 'rejected_action',
      action: 'image_upload',
      reason: 'missing_media_id',
    });
  });

  it('returns a safe rejection when media download fails or max count is exceeded', async () => {
    const draftStore = createDraftStore({
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:00:00.000Z'),
    });
    const draft = await readyImageDraft(draftStore, { conversationId: '601111111111' });
    updateDraft(draftStore, draft.draftId, (current) => ({
      ...current,
      localImagePaths: Array.from({ length: 10 }, (_, index) => `/tmp/photo-${index}.jpg`),
      whatsappMediaIds: Array.from({ length: 10 }, (_, index) => `media-${index}`),
    }));

    const result = await routeWebhookPayloadAsync(sampleWebhookPayload({
      message: {
        id: 'wamid.image-overflow',
        from: '601111111111',
        type: 'image',
        image: { id: 'media-overflow' },
      },
    }), {
      draftStore,
      accessToken: 'test-access-token',
      fetchImpl: async () => {
        throw new Error('fetch should not be called when max count is exceeded');
      },
    });

    expect(result.actions[0]).toMatchObject({
      type: 'rejected_action',
      action: 'image_upload',
      reason: 'media_download_failed',
      message: 'Facebook group-post supports at most 10 images',
    });
  });
});

function dispatch(server, { method = 'GET', path: requestPath = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const handler = server.listeners('request')[0];
    const req = new PassThrough();
    req.method = method;
    req.url = requestPath;
    req.headers = {
      ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
      ...headers,
    };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(statusCode, responseHeaders = {}) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(chunk = '') {
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: String(chunk),
        });
      },
    };

    Promise.resolve(handler(req, res)).catch(reject);
    if (body) req.write(body);
    req.end();
  });
}

async function readyImageDraft(draftStore, { conversationId = 'chat-a', userPhone = '601111111111' } = {}) {
  const { startDraft, selectExistingGroup, setDraftCaption } = await import('../src/whatsapp-flow-state.js');
  const { addGroup, createGroupStore, findGroup } = await import('../src/group-store.js');
  const { loadLocalConfig } = await import('../src/local-config.js');
  const groupStore = createGroupStore({ repoRoot: tmpDir });
  if (!findGroup(groupStore, 'main')) {
    addGroup(groupStore, {
      alias: 'main',
      url: 'https://www.facebook.com/groups/12345',
      approvedForPosting: true,
    });
  }
  const draft = startDraft(draftStore, {
    userPhone,
    conversationId,
  });
  const selected = selectExistingGroup({
    draftStore,
    config: loadLocalConfig(tmpDir),
    draftId: draft.draftId,
    groupAlias: 'main',
  });
  return setDraftCaption(draftStore, selected.draftId, 'Caption text');
}

async function dryRunReadyDraft(draftStore, { conversationId = 'chat-a' } = {}) {
  const userPhone = /^60\d+/.test(conversationId) ? conversationId : '601111111111';
  const draft = await readyImageDraft(draftStore, { conversationId, userPhone });
  updateDraft(draftStore, draft.draftId, (current) => ({
    ...current,
    localImagePaths: [path.join(tmpDir, 'photo-1.jpg')],
    whatsappMediaIds: ['media-1'],
    status: 'ready_for_dry_run',
  }));
  updateDraft(draftStore, draft.draftId, (current) => ({
    ...current,
    status: 'dry_run_running',
  }));
  return updateDraft(draftStore, draft.draftId, (current) => ({
    ...current,
    status: 'dry_run_ready',
    dryRunScreenshotPath: './artifacts/facebook-group-post/dry-run.png',
    confirmationToken: 'test-confirmation-token',
    confirmationExpiresAt: '2026-06-17T13:00:00.000Z',
    lastWorkerResult: {
      ok: true,
      status: 'dry-run-ready',
      mode: 'dry-run',
      screenshot: './artifacts/facebook-group-post/dry-run.png',
    },
  }));
}

function postPayload(from) {
  return sampleWebhookPayload({
    message: {
      id: `wamid.post-${from}`,
      from,
      type: 'text',
      text: {
        body: 'POST',
      },
    },
  });
}

function textPayload(body, from = '601111111111') {
  return sampleWebhookPayload({
    message: {
      id: `wamid.text-${body.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      from,
      type: 'text',
      text: { body },
    },
  });
}

function jsonResponse(value, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return value;
    },
  };
}

function binaryResponse(value, { ok = true, status = 200 } = {}) {
  const buffer = Buffer.from(value);
  return {
    ok,
    status,
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

function createOutput() {
  let buffer = '';
  return {
    write(chunk) {
      buffer += chunk;
    },
    text() {
      return buffer;
    },
  };
}

function sampleWebhookPayload({ message }) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                phone_number_id: 'phone-number-id',
              },
              contacts: [
                {
                  wa_id: message.from,
                },
              ],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}
