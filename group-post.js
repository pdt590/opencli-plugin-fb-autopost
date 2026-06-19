import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureArtifactDir, captureScreenshot } from './src/artifacts.js';
import { assertSafePage } from './src/auth-detection.js';
import {
  captionVerified,
  clickPostButton,
  insertCaption,
  openComposer,
  pollPostOutcome,
  verifyGroupPageLoaded,
} from './src/composer.js';
import { attachImages } from './src/images.js';
import { buildResult } from './src/result.js';
import { readArg, resolveInputs } from './src/validate.js';

export async function groupPost(first, second) {
  const { page, kwargs } = normalizeInvocation(first, second);
  if (!page) {
    throw new CommandExecutionError('Facebook group-post requires a browser page');
  }

  const input = resolveInputs(kwargs);
  const timing = readArg(kwargs, '__timing') || {};
  ensureArtifactDir(input.screenshotDir);

  await page.goto(input.groupUrl, { waitUntil: 'load', settleMs: 3000 });
  await assertSafePage(page, {
    screenshotDir: input.screenshotDir,
    label: 'security-after-navigation',
  });
  await verifyGroupPageLoaded(page, input.groupUrl, {
    screenshotDir: input.screenshotDir,
  });

  await openComposer(page, {
    screenshotDir: input.screenshotDir,
    timeoutMs: timing.openComposerTimeoutMs,
    intervalMs: timing.openComposerIntervalMs,
  });
  await insertCaption(page, input.caption, {
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
        groupUrl: input.groupUrl,
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
      groupUrl: input.groupUrl,
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

cli({
  site: 'facebook',
  name: 'group-post',
  access: 'write',
  description: 'Prepare a post in a Facebook group (dry-run by default; --confirm true to publish)',
  domain: 'www.facebook.com',
  strategy: Strategy.UI,
  browser: true,
  defaultWindowMode: 'foreground',
  defaultFormat: 'json',
  args: [
    { name: 'group-url', type: 'string', required: true, help: 'Full Facebook group URL' },
    { name: 'caption', type: 'string', help: 'Caption text (exclusive with --caption-file)' },
    { name: 'caption-file', type: 'string', help: 'Path to UTF-8 caption file' },
    {
      name: 'images',
      type: 'string',
      help: 'Comma-separated image paths, max 10 (jpg/jpeg/png/webp/gif)',
    },
    { name: 'dry-run', type: 'boolean', default: false, help: 'Fill composer, never click Post (default mode)' },
    { name: 'confirm', type: 'boolean', default: false, help: 'Required to click Post. Set --confirm true.' },
    {
      name: 'screenshot-dir',
      type: 'string',
      default: './artifacts/facebook-group-post',
      help: 'Artifact directory',
    },
  ],
  columns: ['status', 'mode', 'group_url', 'message', 'caption_length', 'image_count', 'screenshot'],
  func: groupPost,
});

export const __test__ = { groupPost, normalizeInvocation };
