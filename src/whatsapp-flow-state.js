import { resolveGroupAlias } from './local-config.js';
import {
  createDraft,
  getDraft,
  updateDraft,
  DraftStoreError,
} from './draft-store.js';
import {
  addGroup,
  approveGroup,
  findGroup,
} from './group-store.js';
import { MAX_IMAGES, parseGroupUrl } from './validate.js';
import {
  runDryRunWorker,
  runLiveWorker,
} from './worker-client.js';
import crypto from 'node:crypto';

export const DEFAULT_CONFIRMATION_TTL_MS = 30 * 60 * 1000;

export class FlowStateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FlowStateError';
  }
}

export function startDraft(store, { userPhone, conversationId }) {
  return createDraft(store, { userPhone, conversationId });
}

export function selectExistingGroup({ draftStore, config, draftId, groupAlias }) {
  let groupUrl;
  try {
    groupUrl = resolveGroupAlias(config, groupAlias);
  } catch (error) {
    throw new FlowStateError(error.message);
  }

  return updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    groupAlias,
    groupUrl,
    pendingGroupAlias: null,
    pendingGroupUrl: null,
    status: 'collecting_caption',
  }));
}

export function addGroupAndSelect({
  draftStore,
  groupStore,
  draftId,
  alias,
  url,
  label,
  confirmApproval = false,
}) {
  if (confirmApproval !== true) {
    const existing = findGroup(groupStore, alias);
    if (!existing) {
      addGroup(groupStore, {
        alias,
        url,
        label,
        approvedForPosting: false,
      });
    }
    throw new FlowStateError('New group aliases require explicit confirmation before approval');
  }

  const existing = findGroup(groupStore, alias);
  const group = existing || addGroup(groupStore, {
    alias,
    url,
    label,
    approvedForPosting: false,
  });
  const approved = group.approvedForPosting ? group : approveGroup(groupStore, group.alias);

  return updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    groupAlias: approved.alias,
    groupUrl: approved.url,
    pendingGroupAlias: null,
    pendingGroupUrl: null,
    status: 'collecting_caption',
  }));
}

export function setDraftCaption(draftStore, draftId, caption) {
  if (typeof caption !== 'string' || !caption.trim()) {
    throw new FlowStateError('Caption must not be empty');
  }

  return updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    caption,
    status: 'collecting_images',
  }));
}

export function markDraftNoImages(draftStore, draftId) {
  return updateDraft(draftStore, draftId, (draft) => {
    assertReadyForImages(draft);
    return {
      ...draft,
      localImagePaths: [],
      whatsappMediaIds: [],
      status: 'ready_for_dry_run',
    };
  });
}

export function setDraftImages(draftStore, draftId, { localImagePaths = [], whatsappMediaIds = [] } = {}) {
  if (!Array.isArray(localImagePaths) || localImagePaths.length === 0) {
    throw new FlowStateError('At least one local image path is required, or mark no-images explicitly');
  }
  return updateDraft(draftStore, draftId, (draft) => {
    assertReadyForImages(draft);
    return {
      ...draft,
      localImagePaths,
      whatsappMediaIds,
      status: 'ready_for_dry_run',
    };
  });
}

export function appendDraftImage(draftStore, draftId, { localPath, mediaId }) {
  if (!localPath || /^https?:\/\//i.test(localPath)) {
    throw new FlowStateError('Only local image paths may be added to a draft');
  }
  if (!mediaId) throw new FlowStateError('WhatsApp media ID is required for image traceability');

  return updateDraft(draftStore, draftId, (draft) => {
    assertReadyForImages(draft);
    if (draft.localImagePaths.length >= MAX_IMAGES) {
      throw new FlowStateError(`Facebook group-post supports at most ${MAX_IMAGES} images`);
    }
    return {
      ...draft,
      localImagePaths: [...draft.localImagePaths, localPath],
      whatsappMediaIds: [...draft.whatsappMediaIds, mediaId],
      status: 'collecting_images',
    };
  });
}

export function validateDirectGroupUrl(url) {
  try {
    return parseGroupUrl(url);
  } catch (error) {
    throw new FlowStateError(error.message);
  }
}

export function transitionDraft(draftStore, draftId, status, patch = {}) {
  if (isDirectLiveState(status)) {
    throw new FlowStateError(`Live state cannot be reached directly: ${status}`);
  }
  return updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    ...patch,
    status,
  }));
}

export function runDraftDryRun(
  draftStore,
  draftId,
  {
    repoRoot = process.cwd(),
    screenshotDir,
    confirmationTtlMs = DEFAULT_CONFIRMATION_TTL_MS,
    runCommand,
    now = () => new Date(),
  } = {},
) {
  const running = updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    status: 'dry_run_running',
    lastWorkerResult: null,
  }));
  const workerCall = runDryRunWorker(running, {
    repoRoot,
    screenshotDir,
    runCommand,
  });
  const result = workerCall.workerResult;

  if (workerCall.exitCode === 0 && result?.status === 'dry-run-ready') {
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + confirmationTtlMs);
    const updated = updateDraft(draftStore, draftId, (draft) => ({
      ...draft,
      status: 'dry_run_ready',
      dryRunScreenshotPath: result.screenshot || null,
      confirmationToken: createConfirmationToken(),
      confirmationExpiresAt: expiresAt.toISOString(),
      lastWorkerResult: result,
    }));
    return {
      ok: true,
      draft: updated,
      workerCall,
      workerResult: result,
    };
  }

  const failed = updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    status: 'failed',
    dryRunScreenshotPath: result?.screenshot || draft.dryRunScreenshotPath || null,
    lastWorkerResult: result,
  }));
  return {
    ok: false,
    draft: failed,
    workerCall,
    workerResult: result,
  };
}

export function runDraftLivePost(
  draftStore,
  draftId,
  {
    repoRoot = process.cwd(),
    screenshotDir,
    runCommand,
    now = () => new Date(),
  } = {},
) {
  assertReadyForLivePost(draftStore, draftId, { now });
  const approved = updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    status: 'approved_for_post',
  }));
  const posting = updateDraft(draftStore, approved.draftId, (draft) => ({
    ...draft,
    status: 'posting',
    lastWorkerResult: null,
  }));
  const workerCall = runLiveWorker(posting, {
    repoRoot,
    screenshotDir,
    runCommand,
  });
  const workerResult = workerCall.workerResult;
  const status = mapLiveWorkerStatus(workerCall.exitCode, workerResult);
  const final = updateDraft(draftStore, posting.draftId, (draft) => ({
    ...draft,
    status,
    lastWorkerResult: workerResult,
  }));

  return {
    ok: status === 'posted' || status === 'pending_review',
    draft: final,
    workerCall,
    workerResult,
    mappedStatus: status,
  };
}

export function cancelDraft(draftStore, draftId) {
  return updateDraft(draftStore, draftId, (draft) => ({
    ...draft,
    status: 'cancelled',
  }));
}

function assertReadyForImages(draft) {
  if (!draft.groupUrl || !draft.caption) {
    throw new DraftStoreError('Draft must have group and caption before images can be completed');
  }
}

function assertReadyForLivePost(draftStore, draftId, { now = () => new Date() } = {}) {
  const draft = getDraftForLivePost(draftStore, draftId);
  if (draft.status !== 'dry_run_ready') {
    throw new FlowStateError('POST requires a draft with status dry_run_ready');
  }
  if (!draft.confirmationToken) {
    throw new FlowStateError('POST requires a valid dry-run confirmation token');
  }
  if (!draft.confirmationExpiresAt) {
    throw new FlowStateError('POST confirmation token is missing an expiry');
  }
  const expiresAt = new Date(draft.confirmationExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now()) {
    throw new FlowStateError('POST confirmation token has expired');
  }
  if (!draft.dryRunScreenshotPath) {
    throw new FlowStateError('POST requires a dry-run screenshot path');
  }
  return draft;
}

function getDraftForLivePost(draftStore, draftId) {
  const draft = draftStore ? getDraft(draftStore, draftId) : null;
  if (!draft) throw new FlowStateError(`Unknown draft: ${draftId}`);
  return draft;
}

function isDirectLiveState(status) {
  return ['dry_run_running', 'dry_run_ready', 'approved_for_post', 'posting', 'posted', 'pending_review'].includes(status);
}

function createConfirmationToken() {
  return crypto.randomBytes(16).toString('hex');
}

function mapLiveWorkerStatus(exitCode, workerResult = {}) {
  if (exitCode === 0 && workerResult?.status === 'posted') return 'posted';
  if (exitCode === 0 && workerResult?.status === 'pending-review') return 'pending_review';
  return 'failed';
}
