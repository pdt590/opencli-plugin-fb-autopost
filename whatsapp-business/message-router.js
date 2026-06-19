import {
  decodeActionId,
  parseTextFallback,
  renderMenu,
} from './interactive-menus.js';
import {
  findActiveDraft,
  listDrafts,
  COLLECTING_STATUSES,
  getDraft,
  updateDraft,
  DraftStoreError,
} from '../src/draft-store.js';
import {
  findGroup,
  listGroups,
  normalizeAlias,
} from '../src/group-store.js';
import {
  hasProcessedMessage,
  recordProcessedMessage,
} from '../src/webhook-event-store.js';
import {
  addGroupAndSelect,
  appendDraftImage,
  cancelDraft,
  markDraftNoImages,
  runDraftDryRun,
  runDraftLivePost,
  selectExistingGroup,
  setDraftCaption,
  setDraftImages,
  startDraft,
  validateDirectGroupUrl,
} from '../src/whatsapp-flow-state.js';
import {
  assertImageCount,
  downloadWhatsAppImage,
  extractImageMediaId,
} from './media-download.js';
import { buildTextMessage } from './send-message.js';

export async function routeWebhookPayloadAsync(payload, options = {}) {
  const messages = extractIncomingMessages(payload);
  const actions = [];
  const responses = [];
  const {
    allowedUsers = [],
    defaultMenu = 'main',
    draftStore = null,
    groupStore = null,
    eventStore = null,
    accessToken = '',
    phoneNumberId = '',
    graphVersion,
    fetchImpl = globalThis.fetch,
    repoRoot = process.cwd(),
    screenshotDir,
    runCommand,
    now,
  } = options;

  for (const item of messages) {
    if (eventStore && hasProcessedMessage(eventStore, item.message?.id)) {
      actions.push({
        type: 'ignored_duplicate',
        action: 'ignore',
        messageId: item.message.id,
        userPhone: item.userPhone,
        conversationId: item.conversationId,
      });
      continue;
    }

    const normalized = normalizeIncomingMessage(item.message, {
      conversationId: item.conversationId,
      userPhone: item.userPhone,
      defaultMenu,
    });

    if (isRejectedUser(normalized.userPhone, allowedUsers)) {
      return {
        ok: false,
        received: true,
        rejected: true,
        reason: 'user_not_allowed',
        statusCode: 403,
        actions,
        responses,
      };
    }

    const routed = await routeNormalizedActionAsync(normalized, {
      draftStore,
      groupStore,
      message: item.message,
      accessToken,
      phoneNumberId,
      graphVersion,
      fetchImpl,
      repoRoot,
      screenshotDir,
      runCommand,
      now,
    });
    actions.push(routed.action);
    if (routed.response) responses.push(routed.response);
    if (eventStore && item.message?.id) recordProcessedMessage(eventStore, item.message.id);
  }

  return {
    ok: true,
    received: true,
    statusCode: 200,
    actions,
    responses,
  };
}

export function routeWebhookPayload(payload, options = {}) {
  const messages = extractIncomingMessages(payload);
  const actions = [];
  const responses = [];
  const {
    allowedUsers = [],
    defaultMenu = 'main',
    draftStore = null,
  } = options;

  for (const item of messages) {
    const normalized = normalizeIncomingMessage(item.message, {
      conversationId: item.conversationId,
      userPhone: item.userPhone,
      defaultMenu,
    });

    if (isRejectedUser(normalized.userPhone, allowedUsers)) {
      return {
        ok: false,
        received: true,
        rejected: true,
        reason: 'user_not_allowed',
        statusCode: 403,
        actions,
        responses,
      };
    }

    const routed = routeNormalizedAction(normalized, { draftStore, message: item.message });
    actions.push(routed.action);
    if (routed.response) responses.push(routed.response);
  }

  return {
    ok: true,
    received: true,
    statusCode: 200,
    actions,
    responses,
  };
}

export function extractIncomingMessages(payload) {
  const messages = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        const userPhone = message.from || value.contacts?.[0]?.wa_id || '';
        messages.push({
          message,
          userPhone,
          conversationId: userPhone,
        });
      }
    }
  }
  return messages;
}

export function normalizeIncomingMessage(message, { conversationId, userPhone, defaultMenu = 'main' } = {}) {
  const action = parseIncomingAction(message, defaultMenu);
  const textBody = message?.type === 'text' ? String(message.text?.body || '').trim() : null;
  const base = {
    type: action ? 'menu_action' : textBody ? 'text_input' : 'unsupported_payload',
    action: action || (textBody ? 'text_input' : 'show_help'),
    conversationId: conversationId || message?.from || '',
    userPhone: userPhone || message?.from || '',
    messageId: message?.id || null,
    ...(textBody ? { text: textBody } : {}),
  };

  if (!action && !textBody) {
    return {
      ...base,
      reason: 'unsupported_payload',
    };
  }

  return base;
}

export function parseIncomingAction(message, defaultMenu = 'main') {
  if (!message || typeof message !== 'object') return null;

  if (message.type === 'image') return 'image_upload';

  if (message.type === 'interactive') {
    const interactive = message.interactive || {};
    if (interactive.type === 'button_reply') {
      return decodeActionId(interactive.button_reply?.id);
    }
    if (interactive.type === 'list_reply') {
      return decodeActionId(interactive.list_reply?.id);
    }
  }

  if (message.type === 'text') {
    return parseTextFallback(message.text?.body, defaultMenu);
  }

  return null;
}

export function routeNormalizedAction(normalized, { draftStore = null } = {}) {
  if (normalized.type !== 'menu_action') {
    return {
      action: normalized,
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  if (normalized.action === 'post') {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'no_draft_state',
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  if (normalized.action === 'new_post' && draftStore) {
    const draft = startDraft(draftStore, {
      userPhone: normalized.userPhone,
      conversationId: normalized.conversationId,
    });
    return {
      action: {
        ...normalized,
        draftId: draft.draftId,
        draftStatus: draft.status,
      },
      response: renderMenu('new_post', { to: normalized.userPhone }),
    };
  }

  if (normalized.action === 'image_upload') {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: draftStore ? 'media_download_requires_async_router' : 'no_draft_state',
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  if (normalized.action === 'dry_run') {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: draftStore ? 'dry_run_requires_async_router' : 'no_draft_state',
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  return {
    action: normalized,
    response: renderMenu(menuForAction(normalized.action), { to: normalized.userPhone }),
  };
}

export async function routeNormalizedActionAsync(
  normalized,
  {
    draftStore = null,
    groupStore = null,
    message = null,
    accessToken = '',
    phoneNumberId = '',
    graphVersion,
    fetchImpl = globalThis.fetch,
    repoRoot = process.cwd(),
    screenshotDir,
    runCommand,
    now,
  } = {},
) {
  if (normalized.action === 'new_post') {
    return routeNewPostAction(normalized, { draftStore, groupStore });
  }

  if (normalized.action === 'use_existing_group') {
    return routeChooseGroupAction(normalized, { groupStore });
  }

  if (normalized.action === 'add_group_url') {
    return {
      action: normalized,
      response: buildTextMessage({
        to: normalized.userPhone,
        text: 'Send the full Facebook group URL. The bot will require APPROVE GROUP before saving and using it.',
      }),
    };
  }

  if (normalized.action === 'approve_group') {
    return routeApproveGroupAction(normalized, { draftStore, groupStore });
  }

  if (normalized.action === 'done') {
    return routeImagesDoneAction(normalized, { draftStore });
  }

  if (normalized.action === 'no_images') {
    return routeNoImagesAction(normalized, { draftStore });
  }

  if (normalized.type === 'text_input') {
    return routeTextInput(normalized, { draftStore, groupStore });
  }

  if (normalized.action === 'groups') {
    return routeGroupsAction(normalized, { groupStore });
  }

  if (normalized.action === 'drafts') {
    return routeDraftsAction(normalized, { draftStore });
  }

  if (normalized.action === 'dry_run') {
    return routeDryRunAction(normalized, {
      draftStore,
      repoRoot,
      screenshotDir,
      runCommand,
      now,
    });
  }

  if (normalized.action === 'post') {
    return routePostAction(normalized, {
      draftStore,
      repoRoot,
      screenshotDir,
      runCommand,
      now,
    });
  }

  if (normalized.action === 'cancel') {
    return routeCancelAction(normalized, { draftStore });
  }

  if (normalized.action !== 'image_upload') {
    return routeNormalizedAction(normalized, { draftStore, message });
  }

  if (!draftStore) {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'no_draft_state',
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  const mediaId = extractImageMediaId(message);
  if (!mediaId) {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'missing_media_id',
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  const draft = findActiveDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    statuses: new Set(['collecting_images', 'ready_for_dry_run']),
  });
  if (!draft) {
    return rejectedText(
      normalized,
      'draft_not_collecting_images',
      'Start New Post and provide the group and caption before sending images.',
    );
  }

  try {
    assertImageCount(draft.localImagePaths, 1);
    const downloaded = await downloadWhatsAppImage({
      mediaId,
      draft,
      draftStore,
      accessToken,
      phoneNumberId,
      graphVersion,
      fetchImpl,
    });
    const imageDraft = ensureImageCollectingDraft(draftStore, draft.draftId);
    const updated = appendDraftImage(draftStore, imageDraft.draftId, {
      localPath: downloaded.localPath,
      mediaId,
    });
    return {
      action: {
        ...normalized,
        draftId: updated.draftId,
        draftStatus: updated.status,
        mediaId,
        localImagePath: downloaded.localPath,
        imageCount: updated.localImagePaths.length,
      },
      response: buildTextMessage({
        to: normalized.userPhone,
        text: `Image ${updated.localImagePaths.length} saved. Send more images, or reply DONE when finished.`,
      }),
    };
  } catch (error) {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'media_download_failed',
        message: error.message,
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }
}

function routeNewPostAction(normalized, { draftStore, groupStore }) {
  if (!draftStore) {
    return rejectedText(normalized, 'no_draft_state', 'Local draft storage is not available.');
  }
  const draft = startDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
  });
  return {
    action: {
      ...normalized,
      draftId: draft.draftId,
      draftStatus: draft.status,
    },
    response: buildTextMessage({
      to: normalized.userPhone,
      text: [
        'New post started.',
        formatApprovedGroups(groupStore),
        'Reply with one approved group alias, or send a full Facebook group URL.',
        'Reply CANCEL to stop.',
      ].join('\n'),
    }),
  };
}

function routeChooseGroupAction(normalized, { groupStore }) {
  return {
    action: normalized,
    response: buildTextMessage({
      to: normalized.userPhone,
      text: [
        formatApprovedGroups(groupStore),
        'Reply with one approved group alias.',
      ].join('\n'),
    }),
  };
}

function routeApproveGroupAction(normalized, { draftStore, groupStore }) {
  if (!draftStore || !groupStore) {
    return rejectedText(normalized, 'group_store_unavailable', 'Local group storage is not available.');
  }
  const draft = findActiveDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    statuses: new Set(['collecting_group']),
  });
  if (!draft?.pendingGroupAlias || !draft?.pendingGroupUrl) {
    return rejectedText(normalized, 'no_pending_group', 'No new group URL is waiting for approval.');
  }

  try {
    const selected = addGroupAndSelect({
      draftStore,
      groupStore,
      draftId: draft.draftId,
      alias: draft.pendingGroupAlias,
      url: draft.pendingGroupUrl,
      confirmApproval: true,
    });
    return {
      action: {
        ...normalized,
        draftId: selected.draftId,
        draftStatus: selected.status,
        groupAlias: selected.groupAlias,
      },
      response: buildTextMessage({
        to: normalized.userPhone,
        text: `Group ${selected.groupAlias} approved for this local installation. Now send the caption.`,
      }),
    };
  } catch (error) {
    return rejectedText(normalized, 'group_approval_failed', error.message);
  }
}

function routeImagesDoneAction(normalized, { draftStore }) {
  const draft = findImageDraft(draftStore, normalized);
  if (!draft) {
    return rejectedText(normalized, 'no_image_draft', 'No draft is currently collecting images.');
  }
  if (draft.localImagePaths.length === 0) {
    return rejectedText(
      normalized,
      'missing_images',
      'No images have been received. Send an image, or reply NO IMAGES for a text-only post.',
    );
  }

  try {
    const ready = setDraftImages(draftStore, draft.draftId, {
      localImagePaths: draft.localImagePaths,
      whatsappMediaIds: draft.whatsappMediaIds,
    });
    return readyForDryRunResponse(normalized, ready);
  } catch (error) {
    return rejectedText(normalized, 'images_not_ready', error.message);
  }
}

function routeNoImagesAction(normalized, { draftStore }) {
  const draft = findImageDraft(draftStore, normalized);
  if (!draft) {
    return rejectedText(normalized, 'no_image_draft', 'No draft is currently collecting images.');
  }

  try {
    const ready = markDraftNoImages(draftStore, draft.draftId);
    return readyForDryRunResponse(normalized, ready);
  } catch (error) {
    return rejectedText(normalized, 'images_not_ready', error.message);
  }
}

function routeTextInput(normalized, { draftStore, groupStore }) {
  if (!draftStore) {
    return rejectedText(normalized, 'no_draft_state', 'Local draft storage is not available.');
  }
  const draft = findActiveDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    statuses: COLLECTING_STATUSES,
  });
  if (!draft) {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'no_active_draft',
      },
      response: renderMenu('main', { to: normalized.userPhone }),
    };
  }

  if (draft.status === 'collecting_group') {
    return routeGroupText(normalized, draft, { draftStore, groupStore });
  }
  if (draft.status === 'collecting_caption') {
    try {
      const updated = setDraftCaption(draftStore, draft.draftId, normalized.text);
      return {
        action: {
          ...normalized,
          draftId: updated.draftId,
          draftStatus: updated.status,
        },
        response: buildTextMessage({
          to: normalized.userPhone,
          text: 'Caption saved. Send up to 10 images. When finished, reply DONE. For a text-only post, reply NO IMAGES.',
        }),
      };
    } catch (error) {
      return rejectedText(normalized, 'caption_rejected', error.message);
    }
  }
  if (draft.status === 'collecting_images') {
    return rejectedText(
      normalized,
      'waiting_for_images',
      `Currently saved images: ${draft.localImagePaths.length}. Send more images, reply DONE, NO IMAGES, or CANCEL.`,
    );
  }
  if (draft.status === 'ready_for_dry_run') {
    return rejectedText(normalized, 'ready_for_dry_run', 'Draft is ready. Reply DRY RUN or CANCEL.');
  }

  return rejectedText(normalized, 'unsupported_draft_state', `Draft is currently ${draft.status}.`);
}

function routeGroupText(normalized, draft, { draftStore, groupStore }) {
  if (!groupStore) {
    return rejectedText(normalized, 'group_store_unavailable', 'Local group storage is not available.');
  }
  const input = normalized.text.trim();

  if (/^https?:\/\//i.test(input)) {
    try {
      const groupUrl = validateDirectGroupUrl(input);
      const existing = listGroups(groupStore).find((group) => group.url === groupUrl);
      if (existing?.approvedForPosting) {
        return selectGroupResponse(normalized, draft, existing.alias, { draftStore, groupStore });
      }

      const alias = deriveGroupAlias(groupUrl);
      const aliasConflict = findGroup(groupStore, alias);
      if (aliasConflict && aliasConflict.url !== groupUrl) {
        return rejectedText(
          normalized,
          'group_alias_conflict',
          `Generated alias ${alias} already belongs to another group. Add this group with the local setup command first.`,
        );
      }
      const pending = updateDraft(draftStore, draft.draftId, (current) => ({
        ...current,
        pendingGroupAlias: alias,
        pendingGroupUrl: groupUrl,
        status: 'collecting_group',
      }));
      return {
        action: {
          ...normalized,
          draftId: pending.draftId,
          draftStatus: pending.status,
          pendingGroupAlias: alias,
        },
        response: buildTextMessage({
          to: normalized.userPhone,
          text: [
            `New group URL received.`,
            `Alias: ${alias}`,
            `URL: ${groupUrl}`,
            'Reply APPROVE GROUP to save and use this group, or CANCEL.',
          ].join('\n'),
        }),
      };
    } catch (error) {
      return rejectedText(normalized, 'invalid_group_url', error.message);
    }
  }

  try {
    const alias = normalizeAlias(input);
    const group = findGroup(groupStore, alias);
    if (!group) {
      return rejectedText(
        normalized,
        'unknown_group_alias',
        `${formatApprovedGroups(groupStore)}\nReply with one alias or a full Facebook group URL.`,
      );
    }
    if (!group.approvedForPosting) {
      return rejectedText(normalized, 'group_not_approved', `Group ${alias} is not approved for posting.`);
    }
    return selectGroupResponse(normalized, draft, alias, { draftStore, groupStore });
  } catch (error) {
    return rejectedText(normalized, 'invalid_group_alias', error.message);
  }
}

function selectGroupResponse(normalized, draft, alias, { draftStore, groupStore }) {
  try {
    const selected = selectExistingGroup({
      draftStore,
      config: { groups: listGroups(groupStore) },
      draftId: draft.draftId,
      groupAlias: alias,
    });
    return {
      action: {
        ...normalized,
        draftId: selected.draftId,
        draftStatus: selected.status,
        groupAlias: selected.groupAlias,
      },
      response: buildTextMessage({
        to: normalized.userPhone,
        text: `Group ${selected.groupAlias} selected. Now send the caption as one WhatsApp message.`,
      }),
    };
  } catch (error) {
    return rejectedText(normalized, 'group_selection_failed', error.message);
  }
}

function routeGroupsAction(normalized, { groupStore }) {
  return {
    action: normalized,
    response: buildTextMessage({
      to: normalized.userPhone,
      text: `${formatApprovedGroups(groupStore)}\nUse NEW POST to begin.`,
    }),
  };
}

function routeDraftsAction(normalized, { draftStore }) {
  if (!draftStore) {
    return rejectedText(normalized, 'no_draft_state', 'Local draft storage is not available.');
  }
  const drafts = listDrafts(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
  }).slice(-10);
  const lines = drafts.length
    ? drafts.map((draft, index) => `${index + 1}. ${shortDraftId(draft.draftId)}: ${draft.status}`)
    : ['No drafts found.'];
  return {
    action: normalized,
    response: buildTextMessage({
      to: normalized.userPhone,
      text: ['Recent drafts:', ...lines, 'Use NEW POST to create another draft.'].join('\n'),
    }),
  };
}

function readyForDryRunResponse(normalized, draft) {
  return {
    action: {
      ...normalized,
      draftId: draft.draftId,
      draftStatus: draft.status,
      imageCount: draft.localImagePaths.length,
    },
    response: buildTextMessage({
      to: normalized.userPhone,
      text: [
        'Draft inputs complete.',
        `Group: ${draft.groupAlias || draft.groupUrl}`,
        `Caption length: ${draft.caption.length}`,
        `Images: ${draft.localImagePaths.length}`,
        'Reply DRY RUN to prepare the Facebook draft, or CANCEL.',
      ].join('\n'),
    }),
  };
}

function findImageDraft(draftStore, normalized) {
  if (!draftStore) return null;
  return findActiveDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    statuses: new Set(['collecting_images', 'ready_for_dry_run']),
  });
}

function formatApprovedGroups(groupStore) {
  if (!groupStore) return 'Approved groups: unavailable.';
  const groups = listGroups(groupStore).filter((group) => group.approvedForPosting);
  if (groups.length === 0) return 'Approved groups: none.';
  return ['Approved groups:', ...groups.map((group) => `- ${group.alias}: ${group.label || group.url}`)].join('\n');
}

function deriveGroupAlias(groupUrl) {
  const segment = new URL(groupUrl).pathname.split('/').filter(Boolean).at(-1);
  return normalizeAlias(`group-${String(segment).slice(0, 57)}`);
}

function shortDraftId(draftId) {
  return String(draftId).slice(-8);
}

function routeDryRunAction(normalized, { draftStore, repoRoot, screenshotDir, runCommand, now }) {
  if (!draftStore) {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'no_draft_state',
      },
      response: renderMenu('help', { to: normalized.userPhone }),
    };
  }

  const draft = findActiveDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    statuses: new Set(['ready_for_dry_run']),
  });
  if (!draft) {
    return {
      action: {
        ...normalized,
        type: 'rejected_action',
        reason: 'no_ready_draft',
      },
      response: buildTextMessage({
        to: normalized.userPhone,
        text: 'No draft is ready for dry-run yet. Complete group, caption, and images first.',
      }),
    };
  }

  const result = runDraftDryRun(draftStore, draft.draftId, {
    repoRoot,
    screenshotDir,
    runCommand,
    now,
  });
  return {
    action: {
      ...normalized,
      draftId: result.draft.draftId,
      draftStatus: result.draft.status,
      workerStatus: result.workerResult?.status || 'failed',
      screenshot: result.draft.dryRunScreenshotPath,
      ok: result.ok,
    },
    response: buildDryRunResponse(normalized.userPhone, result),
  };
}

function buildDryRunResponse(to, result) {
  const status = result.workerResult?.status || 'failed';
  const screenshot = result.draft.dryRunScreenshotPath;
  const lines = [
    result.ok ? 'Dry-run ready.' : 'Dry-run failed.',
    `Status: ${status}`,
  ];
  if (screenshot) lines.push(`Screenshot: ${screenshot}`);
  if (!result.ok && result.workerResult?.message) lines.push(`Message: ${result.workerResult.message}`);
  if (result.ok) lines.push('Reply POST to publish or CANCEL to discard after reviewing the local browser draft.');
  return buildTextMessage({
    to,
    text: lines.join('\n'),
  });
}

function routePostAction(normalized, { draftStore, repoRoot, screenshotDir, runCommand, now }) {
  if (!draftStore) {
    return rejectedText(normalized, 'no_draft_state', 'No draft state is available for POST.');
  }

  const selected = selectSingleReadyDraft(draftStore, normalized);
  if (!selected.ok) {
    return rejectedText(normalized, selected.reason, selected.message);
  }

  try {
    const result = runDraftLivePost(draftStore, selected.draft.draftId, {
      repoRoot,
      screenshotDir,
      runCommand,
      now,
    });
    return {
      action: {
        ...normalized,
        draftId: result.draft.draftId,
        draftStatus: result.draft.status,
        workerStatus: result.workerResult?.status || 'failed',
        mappedStatus: result.mappedStatus,
        screenshot: result.workerResult?.screenshot || result.draft.dryRunScreenshotPath,
        ok: result.ok,
      },
      response: buildPostResponse(normalized.userPhone, result),
    };
  } catch (error) {
    return rejectedText(normalized, 'post_rejected', error.message);
  }
}

function routeCancelAction(normalized, { draftStore }) {
  if (!draftStore) {
    return rejectedText(normalized, 'no_draft_state', 'No draft state is available for CANCEL.');
  }

  const draft = findActiveDraft(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    statuses: new Set([
      ...COLLECTING_STATUSES,
      'dry_run_running',
      'dry_run_ready',
      'approved_for_post',
    ]),
  });
  if (!draft) {
    return rejectedText(normalized, 'no_active_draft', 'No active draft was found to cancel.');
  }

  const cancelled = cancelDraft(draftStore, draft.draftId);
  return {
    action: {
      ...normalized,
      draftId: cancelled.draftId,
      draftStatus: cancelled.status,
      ok: true,
    },
    response: buildTextMessage({
      to: normalized.userPhone,
      text: [
        'Draft cancelled.',
        'No live worker command was run.',
        'If a Facebook draft is still open in the local browser, close or discard it manually.',
      ].join('\n'),
    }),
  };
}

function selectSingleReadyDraft(draftStore, normalized) {
  const ready = listDrafts(draftStore, {
    userPhone: normalized.userPhone,
    conversationId: normalized.conversationId,
    status: 'dry_run_ready',
  });
  if (ready.length === 0) {
    return {
      ok: false,
      reason: 'no_dry_run_ready_draft',
      message: 'No dry-run-ready draft was found for this WhatsApp conversation.',
    };
  }
  if (ready.length > 1) {
    return {
      ok: false,
      reason: 'multiple_dry_run_ready_drafts',
      message: 'More than one dry-run-ready draft exists for this WhatsApp conversation. Pick one manually before POST.',
    };
  }
  return {
    ok: true,
    draft: ready[0],
  };
}

function buildPostResponse(to, result) {
  const workerStatus = result.workerResult?.status || 'failed';
  const screenshot = result.workerResult?.screenshot || result.draft.dryRunScreenshotPath;
  const lines = [
    result.ok ? 'Post command finished.' : 'Post command failed.',
    `Status: ${result.mappedStatus}`,
    `Worker status: ${workerStatus}`,
  ];
  if (screenshot) lines.push(`Screenshot: ${screenshot}`);
  if (result.workerResult?.message) lines.push(`Message: ${result.workerResult.message}`);
  if (!result.ok) lines.push('No retry was attempted. Check Facebook manually.');
  return buildTextMessage({
    to,
    text: lines.join('\n'),
  });
}

function rejectedText(normalized, reason, message) {
  return {
    action: {
      ...normalized,
      type: 'rejected_action',
      reason,
      message,
    },
    response: buildTextMessage({
      to: normalized.userPhone,
      text: message,
    }),
  };
}

function ensureImageCollectingDraft(draftStore, draftId) {
  const draft = getDraft(draftStore, draftId);
  if (!draft) throw new DraftStoreError(`Unknown draft: ${draftId}`);
  if (draft.status === 'ready_for_dry_run') {
    return updateDraft(draftStore, draftId, (current) => ({
      ...current,
      status: 'collecting_images',
    }));
  }
  return draft;
}

export function menuForAction(action) {
  if (action === 'new_post') return 'new_post';
  if (action === 'drafts') return 'drafts';
  if (action === 'groups') return 'groups';
  if (action === 'settings') return 'settings';
  if (action === 'help') return 'help';
  if (action === 'main_menu' || action === 'cancel') return 'main';
  return 'help';
}

function isRejectedUser(userPhone, allowedUsers = []) {
  return Array.isArray(allowedUsers) && allowedUsers.length > 0 && !allowedUsers.includes(userPhone);
}
