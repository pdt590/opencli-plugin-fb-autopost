import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDraftStore,
  getDraft,
  updateDraft,
} from '../src/draft-store.js';
import {
  addGroup,
  createGroupStore,
  findGroup,
  listGroups,
  removeGroup,
  renameGroup,
} from '../src/group-store.js';
import { loadLocalConfig } from '../src/local-config.js';
import {
  appendDraftImage,
  addGroupAndSelect,
  cancelDraft,
  markDraftNoImages,
  runDraftDryRun,
  runDraftLivePost,
  selectExistingGroup,
  setDraftCaption,
  setDraftImages,
  startDraft,
  transitionDraft,
  validateDirectGroupUrl,
} from '../src/whatsapp-flow-state.js';
import {
  buildDryRunJob,
  buildLiveJob,
  dryRunJobPath,
  liveJobPath,
} from '../src/worker-client.js';
import { routeWebhookPayload } from '../whatsapp-business/message-router.js';

let tmpDir;
let draftStore;
let groupStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-flow-'));
  draftStore = createDraftStore({
    repoRoot: tmpDir,
    now: () => new Date('2026-06-17T12:00:00.000Z'),
  });
  groupStore = createGroupStore({ repoRoot: tmpDir });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('group store helpers', () => {
  it('adds, lists, renames, removes, and approves groups against config/groups.json', () => {
    const group = addGroup(groupStore, {
      alias: 'Main Group',
      label: 'Main Group',
      url: 'https://www.facebook.com/groups/12345',
    });

    expect(group).toMatchObject({
      alias: 'main-group',
      url: 'https://www.facebook.com/groups/12345',
      approvedForPosting: false,
    });
    expect(listGroups(groupStore)).toHaveLength(1);

    const renamed = renameGroup(groupStore, 'main-group', 'sales-group');
    expect(renamed.alias).toBe('sales-group');

    removeGroup(groupStore, 'sales-group');
    expect(listGroups(groupStore)).toEqual([]);
  });

  it('validates group URLs and rejects duplicate aliases', () => {
    addGroup(groupStore, {
      alias: 'main',
      url: 'https://www.facebook.com/groups/12345',
    });

    expect(() => addGroup(groupStore, {
      alias: 'main',
      url: 'https://www.facebook.com/groups/99999',
    })).toThrow('duplicate group alias: main');
    expect(() => addGroup(groupStore, {
      alias: 'bad-url',
      url: 'https://www.facebook.com/profile.php?id=123',
    })).toThrow('--group-url must look like https://www.facebook.com/groups/<id-or-slug>');
    expect(validateDirectGroupUrl('https://www.facebook.com/groups/abc.slug')).toBe(
      'https://www.facebook.com/groups/abc.slug',
    );
  });
});

describe('WhatsApp flow state machine', () => {
  it('creates a draft through the router new_post action when a draft store is supplied', () => {
    const result = routeWebhookPayload(sampleWebhookPayload({
      message: {
        id: 'wamid.new-post',
        from: '601111111111',
        type: 'text',
        text: { body: '1' },
      },
    }), { draftStore });

    expect(result.actions[0]).toMatchObject({
      type: 'menu_action',
      action: 'new_post',
      draftStatus: 'collecting_group',
    });
    expect(result.actions[0].draftId).toMatch(/^draft_/);
    expect(result.responses[0].interactive.body.text).toContain('New Post');
  });

  it('selects an existing approved group and advances to collecting_caption', () => {
    addGroup(groupStore, {
      alias: 'main',
      url: 'https://www.facebook.com/groups/12345',
      approvedForPosting: true,
    });
    const draft = startDraft(draftStore, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });

    const updated = selectExistingGroup({
      draftStore,
      config: loadLocalConfig(tmpDir),
      draftId: draft.draftId,
      groupAlias: 'main',
    });

    expect(updated).toMatchObject({
      groupAlias: 'main',
      groupUrl: 'https://www.facebook.com/groups/12345',
      status: 'collecting_caption',
    });
  });

  it('rejects unknown group aliases', () => {
    const draft = startDraft(draftStore, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });

    expect(() => selectExistingGroup({
      draftStore,
      config: loadLocalConfig(tmpDir),
      draftId: draft.draftId,
      groupAlias: 'missing',
    })).toThrow('Unknown group alias "missing"');
  });

  it('requires explicit confirmation before new group aliases are approved for posting', () => {
    const draft = startDraft(draftStore, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });

    expect(() => addGroupAndSelect({
      draftStore,
      groupStore,
      draftId: draft.draftId,
      alias: 'new-main',
      url: 'https://www.facebook.com/groups/12345',
    })).toThrow('New group aliases require explicit confirmation before approval');
    expect(listGroups(groupStore)[0]).toMatchObject({
      alias: 'new-main',
      approvedForPosting: false,
    });

    const selected = addGroupAndSelect({
      draftStore,
      groupStore,
      draftId: draft.draftId,
      alias: 'new-main',
      url: 'https://www.facebook.com/groups/12345',
      confirmApproval: true,
    });

    expect(selected).toMatchObject({
      groupAlias: 'new-main',
      status: 'collecting_caption',
    });
    expect(listGroups(groupStore)[0].approvedForPosting).toBe(true);
  });

  it('requires a non-empty caption', () => {
    const draft = draftAtCaptionStep();

    expect(() => setDraftCaption(draftStore, draft.draftId, '   ')).toThrow('Caption must not be empty');
    const updated = setDraftCaption(draftStore, draft.draftId, 'Caption text');
    expect(updated).toMatchObject({
      caption: 'Caption text',
      status: 'collecting_images',
    });
  });

  it('supports explicitly marking no-images and reaching ready_for_dry_run', () => {
    const draft = draftAtImagesStep();

    const ready = markDraftNoImages(draftStore, draft.draftId);

    expect(ready).toMatchObject({
      localImagePaths: [],
      whatsappMediaIds: [],
      status: 'ready_for_dry_run',
    });
  });

  it('supports local image paths without downloading media in Goal 7C', () => {
    const draft = draftAtImagesStep();

    const ready = setDraftImages(draftStore, draft.draftId, {
      localImagePaths: ['/tmp/photo-1.jpg'],
      whatsappMediaIds: ['media-1'],
    });

    expect(ready).toMatchObject({
      localImagePaths: ['/tmp/photo-1.jpg'],
      whatsappMediaIds: ['media-1'],
      status: 'ready_for_dry_run',
    });
  });

  it('adds downloaded local image paths to an image-collecting draft and keeps status collecting_images', () => {
    const draft = draftAtImagesStep();

    const updated = appendDraftImage(draftStore, draft.draftId, {
      localPath: '/tmp/downloaded.jpg',
      mediaId: 'whatsapp-media-1',
    });

    expect(updated).toMatchObject({
      localImagePaths: ['/tmp/downloaded.jpg'],
      whatsappMediaIds: ['whatsapp-media-1'],
      status: 'collecting_images',
    });
  });

  it('rejects remote image URLs as draft inputs', () => {
    const draft = draftAtImagesStep();

    expect(() => appendDraftImage(draftStore, draft.draftId, {
      localPath: 'https://example.com/photo.jpg',
      mediaId: 'media-1',
    })).toThrow('Only local image paths may be added to a draft');
  });

  it('enforces max image count when appending downloaded images', () => {
    const draft = draftAtImagesStep();
    for (let index = 0; index < 10; index += 1) {
      appendDraftImage(draftStore, draft.draftId, {
        localPath: `/tmp/photo-${index}.jpg`,
        mediaId: `media-${index}`,
      });
    }

    expect(() => appendDraftImage(draftStore, draft.draftId, {
      localPath: '/tmp/photo-11.jpg',
      mediaId: 'media-11',
    })).toThrow('Facebook group-post supports at most 10 images');
    expect(getDraft(draftStore, draft.draftId).localImagePaths).toHaveLength(10);
  });

  it('rejects invalid transitions and direct live states', () => {
    const draft = startDraft(draftStore, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });

    expect(() => transitionDraft(draftStore, draft.draftId, 'posted')).toThrow(
      'Live state cannot be reached directly: posted',
    );
    expect(() => updateDraft(draftStore, draft.draftId, (current) => ({
      ...current,
      status: 'dry_run_ready',
    }))).toThrow('Invalid draft transition: collecting_group -> dry_run_ready');
  });

  it('builds dry-run worker jobs without confirm flags', () => {
    const ready = draftReadyForDryRun();
    const job = buildDryRunJob(ready, {
      screenshotDir: './artifacts/facebook-group-post',
    });

    expect(job).toEqual({
      mode: 'dry-run',
      groupAlias: 'main',
      caption: 'Caption text',
      images: [path.join(tmpDir, 'photo-1.jpg')],
      screenshotDir: './artifacts/facebook-group-post',
    });
    expect(JSON.stringify(job)).not.toContain('confirm');
    expect(dryRunJobPath(ready, { repoRoot: tmpDir })).toBe(path.join(
      tmpDir,
      'artifacts',
      'whatsapp-business',
      'jobs',
      `${ready.draftId}.dry-run.json`,
    ));
  });

  it('runs the local worker dry-run, stores result, screenshot, and confirmation token', () => {
    const ready = draftReadyForDryRun();
    const calls = [];
    const result = runDraftDryRun(draftStore, ready.draftId, {
      repoRoot: tmpDir,
      screenshotDir: './artifacts/facebook-group-post',
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

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{
      command: 'node',
      args: [
        'worker/posting-worker.js',
        '--job',
        path.join('artifacts', 'whatsapp-business', 'jobs', `${ready.draftId}.dry-run.json`),
      ],
      options: { cwd: tmpDir },
    }]);
    expect(calls[0].args).not.toContain('--confirm');
    expect(calls[0].args).not.toContain('true');

    const jobFile = JSON.parse(fs.readFileSync(path.join(
      tmpDir,
      'artifacts',
      'whatsapp-business',
      'jobs',
      `${ready.draftId}.dry-run.json`,
    ), 'utf8'));
    expect(jobFile).toEqual({
      mode: 'dry-run',
      caption: 'Caption text',
      images: [path.join(tmpDir, 'photo-1.jpg')],
      screenshotDir: './artifacts/facebook-group-post',
      groupAlias: 'main',
    });

    const saved = getDraft(draftStore, ready.draftId);
    expect(saved.status).toBe('dry_run_ready');
    expect(saved.dryRunScreenshotPath).toBe('./artifacts/facebook-group-post/dry-run.png');
    expect(saved.confirmationToken).toMatch(/^[a-f0-9]{32}$/);
    expect(saved.confirmationExpiresAt).toBe('2026-06-17T13:00:00.000Z');
    expect(saved.lastWorkerResult).toMatchObject({
      status: 'dry-run-ready',
      screenshot: './artifacts/facebook-group-post/dry-run.png',
    });
  });

  it('marks dry-run worker failures failed and keeps the worker screenshot/message', () => {
    const ready = draftReadyForDryRun();
    const result = runDraftDryRun(draftStore, ready.draftId, {
      repoRoot: tmpDir,
      runCommand() {
        return {
          status: 1,
          output: JSON.stringify({
            ok: false,
            status: 'failed',
            message: 'Browser Bridge unavailable',
            screenshot: './artifacts/facebook-group-post/failure.png',
          }),
        };
      },
    });

    expect(result.ok).toBe(false);
    const saved = getDraft(draftStore, ready.draftId);
    expect(saved.status).toBe('failed');
    expect(saved.confirmationToken).toBeNull();
    expect(saved.confirmationExpiresAt).toBeNull();
    expect(saved.dryRunScreenshotPath).toBe('./artifacts/facebook-group-post/failure.png');
    expect(saved.lastWorkerResult).toMatchObject({
      status: 'failed',
      message: 'Browser Bridge unavailable',
    });
  });

  it('invalidates an old confirmation token when the draft changes after dry-run', () => {
    const ready = draftReadyForDryRun();
    runDraftDryRun(draftStore, ready.draftId, {
      repoRoot: tmpDir,
      runCommand() {
        return {
          status: 0,
          output: JSON.stringify({
            status: 'dry-run-ready',
            screenshot: './artifacts/facebook-group-post/dry-run.png',
          }),
        };
      },
    });
    expect(getDraft(draftStore, ready.draftId).confirmationToken).toMatch(/^[a-f0-9]{32}$/);

    const edited = setDraftCaption(draftStore, ready.draftId, 'Edited caption text');

    expect(edited.status).toBe('collecting_images');
    expect(edited.confirmationToken).toBeNull();
    expect(edited.confirmationExpiresAt).toBeNull();
  });

  it('builds live worker jobs from a dry-run-ready draft', () => {
    const draft = draftDryRunReady();
    const job = buildLiveJob(draft, {
      screenshotDir: './artifacts/facebook-group-post',
    });

    expect(job).toEqual({
      mode: 'live',
      groupAlias: 'main',
      caption: 'Caption text',
      images: [path.join(tmpDir, 'photo-1.jpg')],
      screenshotDir: './artifacts/facebook-group-post',
    });
    expect(liveJobPath(draft, { repoRoot: tmpDir })).toBe(path.join(
      tmpDir,
      'artifacts',
      'whatsapp-business',
      'jobs',
      `${draft.draftId}.live.json`,
    ));
  });

  it('runs a live worker call only after dry-run confirmation and passes --confirm true exactly once', () => {
    const draft = draftDryRunReady();
    const calls = [];
    const result = runDraftLivePost(draftStore, draft.draftId, {
      repoRoot: tmpDir,
      screenshotDir: './artifacts/facebook-group-post',
      now: () => new Date('2026-06-17T12:45:00.000Z'),
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

    expect(result.ok).toBe(true);
    expect(result.mappedStatus).toBe('posted');
    expect(calls).toEqual([{
      command: 'node',
      args: [
        'worker/posting-worker.js',
        '--job',
        path.join('artifacts', 'whatsapp-business', 'jobs', `${draft.draftId}.live.json`),
        '--confirm',
        'true',
      ],
      options: { cwd: tmpDir },
    }]);
    expect(calls[0].args.filter((arg) => arg === '--confirm')).toHaveLength(1);
    expect(calls[0].args.filter((arg) => arg === 'true')).toHaveLength(1);

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
    expect(getDraft(draftStore, draft.draftId)).toMatchObject({
      status: 'posted',
      lastWorkerResult: {
        status: 'posted',
        screenshot: './artifacts/facebook-group-post/post.png',
      },
    });
  });

  it('rejects live posting without dry-run-ready status, token, non-expired token, and screenshot', () => {
    const ready = draftReadyForDryRun();
    const runCommand = () => {
      throw new Error('live worker must not be called');
    };

    expect(() => runDraftLivePost(draftStore, ready.draftId, {
      repoRoot: tmpDir,
      runCommand,
    })).toThrow('POST requires a draft with status dry_run_ready');

    const dryRunReady = draftDryRunReady();
    updateDraft(draftStore, dryRunReady.draftId, (current) => ({
      ...current,
      confirmationToken: null,
    }));
    expect(() => runDraftLivePost(draftStore, dryRunReady.draftId, {
      repoRoot: tmpDir,
      runCommand,
    })).toThrow('POST requires a valid dry-run confirmation token');

    const expired = draftDryRunReady();
    updateDraft(draftStore, expired.draftId, (current) => ({
      ...current,
      confirmationExpiresAt: '2026-06-17T12:29:59.000Z',
    }));
    expect(() => runDraftLivePost(draftStore, expired.draftId, {
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand,
    })).toThrow('POST confirmation token has expired');

    const noScreenshot = draftDryRunReady();
    updateDraft(draftStore, noScreenshot.draftId, (current) => ({
      ...current,
      dryRunScreenshotPath: null,
    }));
    expect(() => runDraftLivePost(draftStore, noScreenshot.draftId, {
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:30:00.000Z'),
      runCommand,
    })).toThrow('POST requires a dry-run screenshot path');
  });

  it('rejects live posting after the draft is edited after dry-run', () => {
    const draft = draftDryRunReady();
    setDraftCaption(draftStore, draft.draftId, 'Edited caption text');
    const runCommand = () => {
      throw new Error('live worker must not be called');
    };

    expect(() => runDraftLivePost(draftStore, draft.draftId, {
      repoRoot: tmpDir,
      runCommand,
    })).toThrow('POST requires a draft with status dry_run_ready');
  });

  it.each([
    ['posted', 'posted', true],
    ['pending-review', 'pending_review', true],
    ['failed', 'failed', false],
    ['unknown', 'failed', false],
  ])('maps live worker status %s to draft status %s without retrying', (workerStatus, expectedStatus, expectedOk) => {
    const draft = draftDryRunReady();
    const calls = [];
    const result = runDraftLivePost(draftStore, draft.draftId, {
      repoRoot: tmpDir,
      now: () => new Date('2026-06-17T12:45:00.000Z'),
      runCommand(command, args, options) {
        calls.push({ command, args, options });
        return {
          status: workerStatus === 'failed' ? 1 : 0,
          output: JSON.stringify({
            ok: expectedOk,
            status: workerStatus,
            mode: 'live',
            message: `Worker returned ${workerStatus}`,
            screenshot: `./artifacts/facebook-group-post/${workerStatus}.png`,
          }),
        };
      },
    });

    expect(result.ok).toBe(expectedOk);
    expect(result.mappedStatus).toBe(expectedStatus);
    expect(getDraft(draftStore, draft.draftId).status).toBe(expectedStatus);
    expect(calls).toHaveLength(1);
  });

  it('cancels a draft without calling the worker', () => {
    const draft = draftDryRunReady();

    const cancelled = cancelDraft(draftStore, draft.draftId);

    expect(cancelled.status).toBe('cancelled');
    expect(getDraft(draftStore, draft.draftId).status).toBe('cancelled');
  });
});

function draftAtCaptionStep() {
  if (!findGroup(groupStore, 'main')) {
    addGroup(groupStore, {
      alias: 'main',
      url: 'https://www.facebook.com/groups/12345',
      approvedForPosting: true,
    });
  }
  const draft = startDraft(draftStore, {
    userPhone: '601111111111',
    conversationId: 'chat-a',
  });
  return selectExistingGroup({
    draftStore,
    config: loadLocalConfig(tmpDir),
    draftId: draft.draftId,
    groupAlias: 'main',
  });
}

function draftAtImagesStep() {
  const draft = draftAtCaptionStep();
  return setDraftCaption(draftStore, draft.draftId, 'Caption text');
}

function draftReadyForDryRun() {
  const draft = draftAtImagesStep();
  return setDraftImages(draftStore, draft.draftId, {
    localImagePaths: [path.join(tmpDir, 'photo-1.jpg')],
    whatsappMediaIds: ['media-1'],
  });
}

function draftDryRunReady() {
  const ready = draftReadyForDryRun();
  runDraftDryRun(draftStore, ready.draftId, {
    repoRoot: tmpDir,
    now: () => new Date('2026-06-17T12:30:00.000Z'),
    runCommand() {
      return {
        status: 0,
        output: JSON.stringify({
          ok: true,
          status: 'dry-run-ready',
          mode: 'dry-run',
          screenshot: './artifacts/facebook-group-post/dry-run.png',
        }),
      };
    },
  });
  return getDraft(draftStore, ready.draftId);
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
              contacts: [{ wa_id: message.from }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}
