import fs from 'node:fs';
import path from 'node:path';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

export const MAX_IMAGES = 10;
export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function coerceBoolean(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function parseGroupUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new ArgumentError('--group-url is required');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ArgumentError('--group-url must be a full Facebook group URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ArgumentError('--group-url must use http or https');
  }

  const host = url.hostname.toLowerCase();
  const allowedHosts = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com']);
  if (!allowedHosts.has(host)) {
    throw new ArgumentError('--group-url must be on facebook.com');
  }

  if (!/^\/groups\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) {
    throw new ArgumentError('--group-url must look like https://www.facebook.com/groups/<id-or-slug>');
  }

  return url.toString();
}

export function resolveCaption({ caption, captionFile }) {
  const hasCaption = typeof caption === 'string' && caption.length > 0;
  const hasCaptionFile = typeof captionFile === 'string' && captionFile.length > 0;

  if (hasCaption && hasCaptionFile) {
    throw new ArgumentError('Pass either --caption or --caption-file, not both');
  }

  if (!hasCaption && !hasCaptionFile) {
    throw new ArgumentError('Pass one of --caption or --caption-file');
  }

  let text;
  try {
    text = hasCaption ? caption : fs.readFileSync(captionFile, 'utf8');
  } catch {
    throw new ArgumentError(`Caption file does not exist or is not readable: ${captionFile}`);
  }
  if (!text.trim()) {
    throw new ArgumentError('Caption must not be empty');
  }

  return text;
}

export function resolveMode({ dryRun, confirm }) {
  const wantsDryRun = coerceBoolean(dryRun);
  const wantsConfirm = coerceBoolean(confirm);

  if (wantsDryRun && wantsConfirm) {
    throw new ArgumentError('Pass either --dry-run true or --confirm true, not both');
  }

  return wantsConfirm ? 'live' : 'dry-run';
}

export function resolveImages(rawCsv) {
  if (rawCsv === undefined || rawCsv === null || rawCsv === '') {
    return [];
  }

  const images = String(rawCsv)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (images.length > MAX_IMAGES) {
    throw new CommandExecutionError(`Facebook posting supports at most ${MAX_IMAGES} images`);
  }

  return images.map((imagePath) => {
    const ext = path.extname(imagePath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new CommandExecutionError(
        `Unsupported image extension for ${imagePath}. Use jpg, jpeg, png, webp, or gif.`,
      );
    }

    let stat;
    try {
      stat = fs.statSync(imagePath);
    } catch {
      throw new CommandExecutionError(`Image file does not exist or is not readable: ${imagePath}`);
    }

    if (!stat.isFile()) {
      throw new CommandExecutionError(`Image path is not a file: ${imagePath}`);
    }

    return path.resolve(imagePath);
  });
}

export function resolveInputs(kwargs) {
  const groupUrl = parseGroupUrl(readArg(kwargs, 'group-url', 'groupUrl'));
  const caption = resolveCaption({
    caption: readArg(kwargs, 'caption'),
    captionFile: readArg(kwargs, 'caption-file', 'captionFile'),
  });
  const images = resolveImages(readArg(kwargs, 'images'));
  const mode = resolveMode({
    dryRun: readArg(kwargs, 'dry-run', 'dryRun'),
    confirm: readArg(kwargs, 'confirm'),
  });
  const screenshotDir = readArg(kwargs, 'screenshot-dir', 'screenshotDir') || './artifacts/facebook-group-post';

  return {
    groupUrl,
    caption,
    images,
    mode,
    screenshotDir,
    slow: coerceBoolean(readArg(kwargs, 'slow')),
  };
}

export function readArg(kwargs, hyphenated, camelCase = hyphenated) {
  if (!kwargs) return undefined;
  if (Object.prototype.hasOwnProperty.call(kwargs, hyphenated)) return kwargs[hyphenated];
  if (Object.prototype.hasOwnProperty.call(kwargs, camelCase)) return kwargs[camelCase];
  return undefined;
}

export function resolvePersonInputs(kwargs) {
  return {
    targetUrl: 'https://www.facebook.com/me',
    slow: coerceBoolean(readArg(kwargs, 'slow')),
    caption: resolveCaption({ caption: readArg(kwargs, 'caption'), captionFile: readArg(kwargs, 'caption-file', 'captionFile') }),
    images: resolveImages(readArg(kwargs, 'images')),
    mode: resolveMode({ dryRun: readArg(kwargs, 'dry-run', 'dryRun'), confirm: readArg(kwargs, 'confirm') }),
    screenshotDir: readArg(kwargs, 'screenshot-dir', 'screenshotDir') || './artifacts/facebook-person-post',
  };
}
