import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDraft,
  createDraftStore,
  getDraft,
  isAllowedTransition,
  listDrafts,
  readDraftFile,
  updateDraft,
  writeDraftFile,
  WHATSAPP_ARTIFACTS_DIR,
} from '../src/draft-store.js';

let tmpDir;
let now;
let store;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-drafts-'));
  now = new Date('2026-06-17T12:00:00.000Z');
  store = createDraftStore({
    repoRoot: tmpDir,
    now: () => now,
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('local WhatsApp draft store', () => {
  it('creates a draft with the required fields under artifacts/whatsapp-business', () => {
    const draft = createDraft(store, {
      userPhone: '601111111111',
      conversationId: '601111111111',
    });

    expect(draft).toMatchObject({
      userPhone: '601111111111',
      conversationId: '601111111111',
      groupAlias: null,
      groupUrl: null,
      caption: null,
      localImagePaths: [],
      whatsappMediaIds: [],
      status: 'collecting_group',
      dryRunScreenshotPath: null,
      confirmationToken: null,
      confirmationExpiresAt: null,
      lastWorkerResult: null,
      createdAt: '2026-06-17T12:00:00.000Z',
      updatedAt: '2026-06-17T12:00:00.000Z',
    });
    expect(draft.draftId).toMatch(/^draft_/);
    expect(store.draftsPath).toBe(path.join(tmpDir, WHATSAPP_ARTIFACTS_DIR, 'drafts.json'));
    expect(fs.existsSync(store.draftsPath)).toBe(true);
    expect(fs.statSync(path.join(tmpDir, WHATSAPP_ARTIFACTS_DIR, 'media')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tmpDir, WHATSAPP_ARTIFACTS_DIR, 'jobs')).isDirectory()).toBe(true);
  });

  it('keeps one active collecting draft per user conversation but allows multiple saved drafts', () => {
    const first = createDraft(store, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });
    const sameConversation = createDraft(store, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });
    const otherConversation = createDraft(store, {
      userPhone: '601111111111',
      conversationId: 'chat-b',
    });

    expect(sameConversation.draftId).toBe(first.draftId);
    expect(otherConversation.draftId).not.toBe(first.draftId);

    updateDraft(store, first.draftId, (draft) => ({
      ...draft,
      status: 'cancelled',
    }));
    const replacement = createDraft(store, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });

    expect(replacement.draftId).not.toBe(first.draftId);
    expect(listDrafts(store, { userPhone: '601111111111' })).toHaveLength(3);
  });

  it('performs atomic write through temporary file rename', () => {
    writeDraftFile(store, {
      drafts: [
        {
          draftId: 'draft_atomic',
          userPhone: '601111111111',
          conversationId: 'chat-a',
          status: 'collecting_group',
        },
      ],
    });

    const files = fs.readdirSync(path.dirname(store.draftsPath));
    expect(files).toContain('drafts.json');
    expect(files.some((file) => file.endsWith('.tmp'))).toBe(false);
    expect(readDraftFile(store).drafts[0]).toMatchObject({
      draftId: 'draft_atomic',
      status: 'collecting_group',
      localImagePaths: [],
      whatsappMediaIds: [],
    });
  });

  it('preserves local image paths and WhatsApp media IDs in draft records without tokens', () => {
    writeDraftFile(store, {
      drafts: [
        {
          draftId: 'draft_images',
          userPhone: '601111111111',
          conversationId: 'chat-a',
          groupAlias: 'main',
          groupUrl: 'https://www.facebook.com/groups/12345',
          caption: 'Caption',
          localImagePaths: ['/tmp/photo-1.jpg'],
          whatsappMediaIds: ['media-1'],
          status: 'ready_for_dry_run',
          lastWorkerResult: {
            ok: true,
          },
        },
      ],
    });

    const draft = readDraftFile(store).drafts[0];
    expect(draft).toMatchObject({
      localImagePaths: ['/tmp/photo-1.jpg'],
      whatsappMediaIds: ['media-1'],
      status: 'ready_for_dry_run',
    });
    expect(JSON.stringify(draft)).not.toContain('access-token');
  });

  it('rejects invalid state transitions', () => {
    const draft = createDraft(store, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });

    expect(isAllowedTransition('collecting_group', 'collecting_caption')).toBe(true);
    expect(isAllowedTransition('collecting_group', 'posted')).toBe(false);
    expect(() => updateDraft(store, draft.draftId, (current) => ({
      ...current,
      status: 'posted',
    }))).toThrow('Invalid draft transition: collecting_group -> posted');
  });

  it('updates timestamps and retrieves drafts by id', () => {
    const draft = createDraft(store, {
      userPhone: '601111111111',
      conversationId: 'chat-a',
    });
    now = new Date('2026-06-17T12:05:00.000Z');

    const updated = updateDraft(store, draft.draftId, (current) => ({
      ...current,
      groupAlias: 'main',
      groupUrl: 'https://www.facebook.com/groups/12345',
      status: 'collecting_caption',
    }));

    expect(updated.updatedAt).toBe('2026-06-17T12:05:00.000Z');
    expect(getDraft(store, draft.draftId)).toMatchObject({
      groupAlias: 'main',
      status: 'collecting_caption',
    });
  });
});
