import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const WHATSAPP_ARTIFACTS_DIR = 'artifacts/whatsapp-business';
export const DRAFTS_FILE = 'drafts.json';

export const DRAFT_STATUSES = new Set([
  'collecting_group',
  'collecting_caption',
  'collecting_images',
  'ready_for_dry_run',
  'dry_run_running',
  'dry_run_ready',
  'approved_for_post',
  'posting',
  'posted',
  'pending_review',
  'failed',
  'cancelled',
]);

export const COLLECTING_STATUSES = new Set([
  'collecting_group',
  'collecting_caption',
  'collecting_images',
  'ready_for_dry_run',
]);

export class DraftStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DraftStoreError';
  }
}

export function createDraftStore({ repoRoot = process.cwd(), now = () => new Date() } = {}) {
  const baseDir = path.resolve(repoRoot, WHATSAPP_ARTIFACTS_DIR);
  return {
    repoRoot,
    baseDir,
    draftsPath: path.join(baseDir, DRAFTS_FILE),
    mediaDir: path.join(baseDir, 'media'),
    jobsDir: path.join(baseDir, 'jobs'),
    now,
  };
}

export function ensureDraftStore(store) {
  fs.mkdirSync(store.baseDir, { recursive: true });
  fs.mkdirSync(store.mediaDir, { recursive: true });
  fs.mkdirSync(store.jobsDir, { recursive: true });
  if (!fs.existsSync(store.draftsPath)) {
    writeDraftFile(store, { drafts: [] });
  }
}

export function readDraftFile(store) {
  ensureDraftStore(store);
  return normalizeDraftFile(JSON.parse(fs.readFileSync(store.draftsPath, 'utf8')));
}

export function writeDraftFile(store, value) {
  fs.mkdirSync(store.baseDir, { recursive: true });
  const normalized = normalizeDraftFile(value);
  const tempPath = `${store.draftsPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.renameSync(tempPath, store.draftsPath);
  return normalized;
}

export function createDraft(store, { userPhone, conversationId }) {
  if (!userPhone || !conversationId) {
    throw new DraftStoreError('Draft requires userPhone and conversationId');
  }

  const file = readDraftFile(store);
  const existing = findActiveCollectingDraft(file.drafts, { userPhone, conversationId });
  if (existing) return existing;

  const timestamp = store.now().toISOString();
  const draft = normalizeDraft({
    draftId: `draft_${timestamp.replace(/[^0-9]/g, '')}_${crypto.randomBytes(4).toString('hex')}`,
    userPhone,
    conversationId,
    groupAlias: null,
    groupUrl: null,
    pendingGroupAlias: null,
    pendingGroupUrl: null,
    caption: null,
    localImagePaths: [],
    whatsappMediaIds: [],
    status: 'collecting_group',
    dryRunScreenshotPath: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmationToken: null,
    confirmationExpiresAt: null,
    lastWorkerResult: null,
  });

  file.drafts.push(draft);
  writeDraftFile(store, file);
  return draft;
}

export function listDrafts(store, filter = {}) {
  const file = readDraftFile(store);
  return file.drafts.filter((draft) => matchesFilter(draft, filter));
}

export function getDraft(store, draftId) {
  const file = readDraftFile(store);
  return file.drafts.find((draft) => draft.draftId === draftId) || null;
}

export function findActiveDraft(store, { userPhone, conversationId, statuses = COLLECTING_STATUSES } = {}) {
  const file = readDraftFile(store);
  return file.drafts.find((draft) => (
    (!userPhone || draft.userPhone === userPhone)
    && (!conversationId || draft.conversationId === conversationId)
    && statuses.has(draft.status)
  )) || null;
}

export function updateDraft(store, draftId, updater) {
  const file = readDraftFile(store);
  const index = file.drafts.findIndex((draft) => draft.draftId === draftId);
  if (index < 0) throw new DraftStoreError(`Unknown draft: ${draftId}`);

  const current = file.drafts[index];
  const nextInput = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  const next = normalizeDraft({
    ...nextInput,
    draftId: current.draftId,
    userPhone: current.userPhone,
    conversationId: current.conversationId,
    createdAt: current.createdAt,
    updatedAt: store.now().toISOString(),
  });

  if (!isAllowedTransition(current.status, next.status)) {
    throw new DraftStoreError(`Invalid draft transition: ${current.status} -> ${next.status}`);
  }

  if (shouldInvalidateConfirmation(current, next)) {
    next.confirmationToken = null;
    next.confirmationExpiresAt = null;
  }

  file.drafts[index] = next;
  writeDraftFile(store, file);
  return next;
}

export function findActiveCollectingDraft(drafts, { userPhone, conversationId }) {
  return drafts.find((draft) => (
    draft.userPhone === userPhone
    && draft.conversationId === conversationId
    && COLLECTING_STATUSES.has(draft.status)
  )) || null;
}

export function isAllowedTransition(from, to) {
  if (from === to) return true;
  if (!DRAFT_STATUSES.has(from) || !DRAFT_STATUSES.has(to)) return false;
  if (['posted', 'pending_review', 'cancelled'].includes(from)) return false;

  const allowed = {
    collecting_group: ['collecting_caption', 'cancelled', 'failed'],
    collecting_caption: ['collecting_group', 'collecting_images', 'cancelled', 'failed'],
    collecting_images: ['collecting_caption', 'ready_for_dry_run', 'cancelled', 'failed'],
    ready_for_dry_run: ['collecting_group', 'collecting_caption', 'collecting_images', 'dry_run_running', 'cancelled', 'failed'],
    dry_run_running: ['dry_run_ready', 'failed', 'cancelled'],
    dry_run_ready: ['collecting_group', 'collecting_caption', 'collecting_images', 'approved_for_post', 'cancelled', 'failed'],
    approved_for_post: ['posting', 'cancelled', 'failed'],
    posting: ['posted', 'pending_review', 'failed'],
    failed: ['collecting_group', 'collecting_caption', 'collecting_images', 'cancelled'],
  };

  return allowed[from]?.includes(to) === true;
}

export function normalizeDraftFile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DraftStoreError('draft store file must be an object');
  }
  const drafts = Array.isArray(value.drafts) ? value.drafts.map(normalizeDraft) : [];
  return { drafts };
}

export function normalizeDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new DraftStoreError('draft must be an object');
  }
  if (!draft.draftId) throw new DraftStoreError('draftId is required');
  if (!draft.userPhone) throw new DraftStoreError('userPhone is required');
  if (!draft.conversationId) throw new DraftStoreError('conversationId is required');
  if (!DRAFT_STATUSES.has(draft.status)) {
    throw new DraftStoreError(`Unknown draft status: ${draft.status}`);
  }

  return {
    draftId: String(draft.draftId),
    userPhone: String(draft.userPhone),
    conversationId: String(draft.conversationId),
    groupAlias: draft.groupAlias || null,
    groupUrl: draft.groupUrl || null,
    pendingGroupAlias: draft.pendingGroupAlias || null,
    pendingGroupUrl: draft.pendingGroupUrl || null,
    caption: draft.caption || null,
    localImagePaths: Array.isArray(draft.localImagePaths) ? draft.localImagePaths : [],
    whatsappMediaIds: Array.isArray(draft.whatsappMediaIds) ? draft.whatsappMediaIds : [],
    status: draft.status,
    dryRunScreenshotPath: draft.dryRunScreenshotPath || null,
    createdAt: draft.createdAt || new Date(0).toISOString(),
    updatedAt: draft.updatedAt || draft.createdAt || new Date(0).toISOString(),
    confirmationToken: draft.confirmationToken || null,
    confirmationExpiresAt: draft.confirmationExpiresAt || null,
    lastWorkerResult: draft.lastWorkerResult || null,
  };
}

function matchesFilter(draft, filter) {
  if (filter.userPhone && draft.userPhone !== filter.userPhone) return false;
  if (filter.conversationId && draft.conversationId !== filter.conversationId) return false;
  if (filter.status && draft.status !== filter.status) return false;
  return true;
}

function shouldInvalidateConfirmation(current, next) {
  if (!current.confirmationToken && !current.confirmationExpiresAt) return false;
  const contentChanged = (
    current.groupAlias !== next.groupAlias
    || current.groupUrl !== next.groupUrl
    || current.caption !== next.caption
    || JSON.stringify(current.localImagePaths) !== JSON.stringify(next.localImagePaths)
    || JSON.stringify(current.whatsappMediaIds) !== JSON.stringify(next.whatsappMediaIds)
  );
  const movedBackToEditing = ['collecting_group', 'collecting_caption', 'collecting_images', 'ready_for_dry_run'].includes(next.status);
  return contentChanged || movedBackToEditing;
}
