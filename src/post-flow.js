import fs from 'node:fs';
import path from 'node:path';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureArtifactDir, captureScreenshot } from './artifacts.js';
import { assertSafePage } from './auth-detection.js';
import {
  captionVerified,
  clickPostButton,
  delay,
  insertCaption,
  openComposer,
  pollPostOutcome,
} from './composer.js';
import { attachImages } from './images.js';
import { buildResult } from './result.js';
import { coerceBoolean, readArg } from './validate.js';

export async function runPost(first, second, { resolveInput, verifyTarget, commandName, resultTarget }) {
  const { page, kwargs } = normalizeInvocation(first, second);
  if (!page) {
    throw new CommandExecutionError(`Facebook ${commandName} requires a browser page`);
  }

  const input = resolveInput(kwargs);
  const deferClose = coerceBoolean(readArg(kwargs, 'defer-close', 'deferClose'));
  const timing = readArg(kwargs, '__timing') || {};
  ensureArtifactDir(input.screenshotDir);

  if (![page.newTab, page.selectTab, page.closeTab].every(fn => typeof fn === 'function')) {
    throw new CommandExecutionError('OpenCLI 2.x tab lifecycle support is required. Update OpenCLI before posting.');
  }
  let stage = 'create-tab';
  let progressFile;
  let ownedTab;
  let rows;
  let failure;
  let cleanupError;
  try {
    ownedTab = await page.newTab();
    if (typeof ownedTab !== 'string' || !ownedTab) throw new CommandExecutionError('OpenCLI did not return the task tab identity');
    await page.selectTab(ownedTab);
    progressFile = path.join(input.screenshotDir, `progress-${ownedTab.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    const reportProgress = next => {
      stage = next;
      fs.writeFileSync(progressFile, JSON.stringify({ task_tab: ownedTab, stage, mode: input.mode,
        target_url: input.targetUrl, updated_at: new Date().toISOString(),
        submission_may_have_started: ['submit-attempt', 'verify-outcome', 'complete'].includes(stage) && input.mode === 'live',
      }, null, 2));
    };
    rows = await preparePost(page, input, timing, verifyTarget, resultTarget, reportProgress);
  } catch (error) {
    failure = error;
    failure.message += ` Stage: ${stage}.${progressFile ? ` Progress: ${progressFile}.` : ''}`;
    if (ownedTab) {
      try {
        const screenshot = await captureScreenshot(page, input.screenshotDir, 'task-error');
        failure.message += ` Screenshot: ${screenshot}`;
      } catch { /* Preserve the original failure if the browser is unavailable. */ }
    }
  } finally {
    if (ownedTab && !deferClose) {
      try { await page.closeTab(ownedTab); }
      catch (error) { cleanupError = `Task tab cleanup failed: ${error.message}. Close that tab manually; do not repeat the post.`; }
    }
  }
  if (failure) {
    if (deferClose && ownedTab) failure.message += ` Task tab retained: ${ownedTab}. Verify it before cleanup.`;
    if (cleanupError) failure.message += ` ${cleanupError}`;
    throw failure;
  }
  return rows.map(row => ({ ...row, tab_closed: !deferClose && !cleanupError, ...(deferClose ? { task_tab: ownedTab, cleanup_deferred: true } : {}), ...(cleanupError ? { cleanup_warning: cleanupError } : {}) }));
}

async function preparePost(page, input, timing, verifyTarget, resultTarget, reportProgress) {
  reportProgress('navigate');
  await page.goto(input.targetUrl, { waitUntil: 'load', settleMs: 3000 });
  await assertSafePage(page, {
    screenshotDir: input.screenshotDir,
    label: 'security-after-navigation',
  });
  const target = await verifyTarget(page, input.targetUrl, {
    screenshotDir: input.screenshotDir,
  });
  const resultUrl = resultTarget === 'profileUrl' ? target.url : input.targetUrl;

  reportProgress('open-composer');
  await openComposer(page, {
    screenshotDir: input.screenshotDir,
    timeoutMs: timing.openComposerTimeoutMs,
    intervalMs: timing.openComposerIntervalMs,
  });
  if (input.slow) await delay(600);
  reportProgress('insert-caption');
  await insertCaption(page, input.caption, {
    slow: input.slow,
    screenshotDir: input.screenshotDir,
    timeoutMs: timing.captionTimeoutMs,
    intervalMs: timing.captionIntervalMs,
  });

  if (input.images.length) {
    reportProgress('attach-images');
    await attachImages(page, input.images, {
      screenshotDir: input.screenshotDir,
      timeoutMs: timing.imageTimeoutMs,
      intervalMs: timing.imageIntervalMs,
    });
    if (input.slow) await delay(700);
    const stillHasCaption = await captionVerified(page, input.caption, {
      timeoutMs: timing.captionTimeoutMs,
      intervalMs: timing.captionIntervalMs,
    });
    if (!stillHasCaption) {
      const screenshot = await captureScreenshot(page, input.screenshotDir, 'caption-lost-after-images');
      throw new CommandExecutionError(
        `Caption was not verified after attaching images. Screenshot: ${screenshot}`,
      );
    }
  }

  // Always recheck security after the review pause and before any live click.
  if (input.slow) await delay(2500);
  await assertSafePage(page, {
    screenshotDir: input.screenshotDir,
    label: 'security-before-post',
  });

  if (input.mode === 'dry-run') {
    reportProgress('dry-run-ready');
    return [
      buildResult({
        status: 'dry-run-ready',
        mode: input.mode,
        [resultTarget]: resultUrl,
        message: 'Composer inputs were verified without creating a preview image. Post was not clicked.',
        captionLength: input.caption.length,
        imageCount: input.images.length,
        screenshot: null,
      }),
    ];
  }

  reportProgress('submit-attempt');
  await clickPostButton(page, {
    screenshotDir: input.screenshotDir,
    caption: input.caption,
  });
  reportProgress('verify-outcome');
  const outcome = await pollPostOutcome(page, {
    timeoutMs: timing.postOutcomeTimeoutMs,
    intervalMs: timing.postOutcomeIntervalMs,
  });
  const screenshot = await captureScreenshot(page, input.screenshotDir, 'post');
  reportProgress('complete');

  return [
    buildResult({
      status: outcome.status,
      mode: input.mode,
      [resultTarget]: resultUrl,
      message: outcome.message,
      evidence: outcome.evidence,
      postUrl: outcome.post_url,
      captionLength: input.caption.length,
      imageCount: input.images.length,
      screenshot,
    }),
  ];
}

export function normalizeInvocation(first, second) {
  if (first && typeof first.goto === 'function') {
    return { page: first, kwargs: second || {} };
  }

  if (first?.page) {
    return { page: first.page, kwargs: second || first.kwargs || first.args || {} };
  }

  if (second?.page) {
    return { page: second.page, kwargs: first || {} };
  }

  return { page: undefined, kwargs: second || first || {} };
}
