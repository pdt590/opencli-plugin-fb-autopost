import path from 'node:path';
import { parseGroupUrl, resolveCaption, resolveImages } from './validate.js';
import { DEFAULT_SETTINGS, resolveGroupAlias } from './local-config.js';

export class JobValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JobValidationError';
    this.code = 'JOB_VALIDATION';
  }
}

export function normalizeJob(job, { config, jobDir, repoRoot = process.cwd(), confirm = false } = {}) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    throw new JobValidationError('Worker accepts exactly one local JSON job object');
  }

  const mode = normalizeMode(job.mode);
  if (confirm && mode !== 'live') {
    throw new JobValidationError('--confirm true is only valid when job mode is "live"');
  }
  if (mode === 'live' && confirm !== true) {
    throw new JobValidationError('Live worker jobs require job mode "live" and CLI flag --confirm true');
  }

  const groupUrl = resolveJobGroupUrl(job, config);
  const captionSource = resolveJobCaption(job, jobDir);
  const images = resolveJobImages(job.images, jobDir);
  const screenshotDir = resolveJobScreenshotDir(job, { jobDir, repoRoot, config });

  return {
    mode,
    groupUrl,
    ...captionSource,
    images,
    screenshotDir,
  };
}

export function normalizeMode(mode) {
  if (mode === undefined || mode === null || mode === '') return 'dry-run';
  if (mode === 'dry-run' || mode === 'live') return mode;
  throw new JobValidationError('Job mode must be "dry-run" or "live"');
}

export function resolveJobGroupUrl(job, config = {}) {
  const explicitUrl = readJobValue(job, 'groupUrl', 'group_url');
  const explicitAlias = readJobValue(job, 'groupAlias', 'group_alias');
  const group = readJobValue(job, 'group');

  const groupLooksLikeUrl = typeof group === 'string' && /^https?:\/\//i.test(group);
  const groupUrl = explicitUrl || (groupLooksLikeUrl ? group : undefined);
  const groupAlias = explicitAlias || (!groupLooksLikeUrl ? group : undefined);

  if (groupUrl && groupAlias) {
    throw new JobValidationError('Pass either groupUrl or groupAlias, not both');
  }
  if (!groupUrl && !groupAlias) {
    throw new JobValidationError('Job must include groupAlias or groupUrl');
  }
  if (groupUrl) {
    return parseGroupUrl(groupUrl);
  }

  try {
    return resolveGroupAlias(config, groupAlias);
  } catch (error) {
    throw new JobValidationError(error.message);
  }
}

export function resolveJobCaption(job, jobDir = process.cwd()) {
  const caption = readJobValue(job, 'caption');
  const rawCaptionFile = readJobValue(job, 'captionFile', 'caption_file');
  const captionFile = rawCaptionFile ? resolveLocalPath(rawCaptionFile, jobDir) : undefined;

  try {
    const text = resolveCaption({ caption, captionFile });
    if (captionFile) {
      return {
        captionFile,
        captionLength: text.length,
      };
    }
    return {
      caption,
      captionLength: text.length,
    };
  } catch (error) {
    throw new JobValidationError(error.message);
  }
}

export function resolveJobImages(images, jobDir = process.cwd()) {
  if (images === undefined || images === null || images === '') return [];
  const values = Array.isArray(images)
    ? images
    : String(images)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  for (const image of values) {
    if (typeof image !== 'string' || !image.trim()) {
      throw new JobValidationError('Job images must be local file paths');
    }
    if (/^https?:\/\//i.test(image)) {
      throw new JobValidationError('Worker only accepts local image paths, not remote URLs');
    }
  }

  const resolved = values.map((image) => resolveLocalPath(image, jobDir));
  try {
    return resolveImages(resolved.join(','));
  } catch (error) {
    throw new JobValidationError(error.message);
  }
}

export function resolveJobScreenshotDir(job, { jobDir = process.cwd(), repoRoot = process.cwd(), config = {} } = {}) {
  const raw = readJobValue(job, 'screenshotDir', 'screenshot_dir');
  if (raw) return resolveLocalPath(raw, jobDir);

  const settingsDir = config.settings?.artifactsDir || DEFAULT_SETTINGS.artifactsDir;
  return path.resolve(repoRoot, settingsDir);
}

export function buildOpenCliArgs(job) {
  const args = ['facebook', 'group-post', '--group-url', job.groupUrl];

  if (job.captionFile) {
    args.push('--caption-file', job.captionFile);
  } else {
    args.push('--caption', job.caption);
  }

  if (job.images.length) {
    args.push('--images', job.images.join(','));
  }

  if (job.screenshotDir) {
    args.push('--screenshot-dir', job.screenshotDir);
  }

  if (job.mode === 'live') {
    args.push('--confirm', 'true');
  } else {
    args.push('--dry-run', 'true');
  }

  return args;
}

export function buildWorkerResult({ job, opencliResult }) {
  const row = parseOpenCliRow(opencliResult.output);
  const ok = opencliResult.status === 0 && row?.status !== 'failed';
  return {
    ok,
    status: row?.status || (opencliResult.status === 0 ? 'unknown' : 'failed'),
    mode: job.mode,
    group_url: row?.group_url || job.groupUrl,
    message: row?.message || opencliResult.output?.trim() || 'OpenCLI command finished without JSON output.',
    caption_length: row?.caption_length ?? job.captionLength,
    image_count: row?.image_count ?? job.images.length,
    screenshot: row?.screenshot || null,
    opencli_exit_code: opencliResult.status,
  };
}

export function buildRejectedResult(error) {
  return {
    ok: false,
    status: 'rejected',
    message: error.message,
  };
}

export function parseOpenCliRow(output = '') {
  const text = String(output || '').trim();
  if (!text) return null;
  const jsonText = extractLeadingJson(text);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) return parsed[0] || null;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function extractLeadingJson(text) {
  const source = String(text || '').trimStart();
  if (!source) return null;
  const opener = source[0];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (!closer) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(0, index + 1);
      }
    }
  }

  return null;
}

export function readJobValue(job, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(job, key)) return job[key];
  }
  return undefined;
}

export function resolveLocalPath(filePath, baseDir = process.cwd()) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new JobValidationError('Local path must be a non-empty string');
  }
  if (/^https?:\/\//i.test(filePath)) {
    throw new JobValidationError('Remote URLs are not allowed in local worker jobs');
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}
