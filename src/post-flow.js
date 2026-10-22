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
import { readArg } from './validate.js';

export async function runPost(first, second, { resolveInput, verifyTarget, commandName, resultTarget }) {
  const { page, kwargs } = normalizeInvocation(first, second);
  if (!page) {
    throw new CommandExecutionError(`Facebook ${commandName} requires a browser page`);
  }

  const input = resolveInput(kwargs);
  const timing = readArg(kwargs, '__timing') || {};
  ensureArtifactDir(input.screenshotDir);

  await page.goto(input.targetUrl, { waitUntil: 'load', settleMs: 3000 });
  await assertSafePage(page, {
    screenshotDir: input.screenshotDir,
    label: 'security-after-navigation',
  });
  const target = await verifyTarget(page, input.targetUrl, {
    screenshotDir: input.screenshotDir,
  });
  const resultUrl = resultTarget === 'profileUrl' ? target.url : input.targetUrl;

  await openComposer(page, {
    screenshotDir: input.screenshotDir,
    timeoutMs: timing.openComposerTimeoutMs,
    intervalMs: timing.openComposerIntervalMs,
  });
  if (input.slow) await delay(600);
  await insertCaption(page, input.caption, {
    slow: input.slow,
    screenshotDir: input.screenshotDir,
    timeoutMs: timing.captionTimeoutMs,
    intervalMs: timing.captionIntervalMs,
  });

  if (input.images.length) {
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
    const screenshot = await captureScreenshot(page, input.screenshotDir, 'dry-run');
    return [
      buildResult({
        status: 'dry-run-ready',
        mode: input.mode,
        [resultTarget]: resultUrl,
        message: 'Composer is prepared and left open for human review. Post was not clicked.',
        captionLength: input.caption.length,
        imageCount: input.images.length,
        screenshot,
      }),
    ];
  }

  await clickPostButton(page, {
    screenshotDir: input.screenshotDir,
  });
  const outcome = await pollPostOutcome(page, {
    timeoutMs: timing.postOutcomeTimeoutMs,
    intervalMs: timing.postOutcomeIntervalMs,
  });
  const screenshot = await captureScreenshot(page, input.screenshotDir, 'post');

  return [
    buildResult({
      status: outcome.status,
      mode: input.mode,
      [resultTarget]: resultUrl,
      message: outcome.message,
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
