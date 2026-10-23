import fs from 'node:fs';
import path from 'node:path';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { captureScreenshot } from './artifacts.js';
import { ACTIVE_DIALOG_HELPERS, evaluateWithArgs, PHOTO_BUTTON_LABELS, poll } from './composer.js';

const FILE_INPUT_MARKER = 'data-opencli-social-autopost-file-input';
const FILE_INPUT_SELECTOR = `input[type="file"][${FILE_INPUT_MARKER}="active"]`;

const FIND_FILE_INPUT_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { found: false, reason: 'dialog-not-found' };
  const inputs = Array.from(dialog.querySelectorAll('input[type="file"]'));
  const imageInput = inputs.find((input) => {
    const accept = String(input.getAttribute('accept') || '').toLowerCase();
    return !accept || accept.includes('image') || accept.includes('.jpg') || accept.includes('.png');
  });
  if (!imageInput) return { found: false, reason: 'input-not-found' };
  for (const oldInput of document.querySelectorAll('input[type="file"][${FILE_INPUT_MARKER}]')) {
    oldInput.removeAttribute('${FILE_INPUT_MARKER}');
  }
  imageInput.setAttribute('${FILE_INPUT_MARKER}', 'active');
  return { found: true, selector: '${FILE_INPUT_SELECTOR}' };
})()`;

const CLICK_PHOTO_BUTTON_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const labelSet = labels.map(normalize).filter(Boolean);
  const dialog = activeDialog();
  if (!dialog) return { clicked: false, reason: 'dialog-not-found' };
  const buttons = Array.from(dialog.querySelectorAll('[role="button"], button, input[type="file"]'))
    .filter(elementVisible)
    .filter((el) => el.getAttribute('aria-disabled') !== 'true' && el.getAttribute('disabled') === null);
  for (const el of buttons) {
    const text = normalize([
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.innerText,
      el.textContent,
    ].filter(Boolean).join(' '));
    const matched = labelSet.some((label) => text === label || text.startsWith(label) || text.includes(label));
    if (matched) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return { clicked: true, label: text };
    }
  }
  return { clicked: false, reason: 'photo-button-not-found' };
})()`;

const WAIT_FOR_PREVIEWS_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { ready: false, reason: 'dialog-not-found', count: 0 };
  const visible = (el) => elementVisible(el);
  const imageUrls = new Set(
    Array.from(dialog.querySelectorAll('img'))
      .filter(visible)
      .map((img) => img.currentSrc || img.src || '')
      .filter((src) => src.startsWith('blob:') || src.startsWith('data:'))
  );
  const removeButtons = Array.from(dialog.querySelectorAll('[aria-label], [role="button"]')).filter((el) => {
    const label = String(el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
    return label.includes('remove photo') || label.includes('remove image') || label.includes('移除照片') || label.includes('删除照片');
  }).length;
  const progress = dialog.querySelector('[role="progressbar"], [aria-busy="true"]');
  const count = Math.max(imageUrls.size, removeButtons);
  return { ready: count >= expectedCount && !progress, count, hasProgress: Boolean(progress) };
})()`;

const ATTACH_VIA_DATATRANSFER_SCRIPT = `(() => {
  const input = document.querySelector(selector);
  if (!input) return { attached: false, reason: 'input-not-found' };
  const base64ToFile = (file) => {
    const binary = atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], file.name, { type: file.type });
  };
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(base64ToFile(file));
  }
  let assigned = false;
  try {
    Object.defineProperty(input, 'files', { value: transfer.files, writable: false, configurable: true });
    assigned = input.files && input.files.length >= files.length;
  } catch {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, transfer.files);
        assigned = input.files && input.files.length >= files.length;
      }
    } catch {
      assigned = false;
    }
  }
  if (!assigned) return { attached: false, reason: 'could-not-assign-files' };
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { attached: true, count: input.files.length };
})()`;

export async function ensureFileInput(page, { screenshotDir, timeoutMs = 10000, intervalMs = 250 } = {}) {
  const existing = await page.evaluate(FIND_FILE_INPUT_SCRIPT);
  if (existing?.found) {
    return existing.selector;
  }

  await evaluateWithArgs(page, CLICK_PHOTO_BUTTON_SCRIPT, {
    labels: PHOTO_BUTTON_LABELS,
  });

  const found = await poll(
    () => page.evaluate(FIND_FILE_INPUT_SCRIPT),
    (state) => state?.found,
    { timeoutMs, intervalMs },
  );

  if (!found?.found) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'image-file-input-not-found');
    throw new CommandExecutionError(`Could not find Facebook image file input. Screenshot: ${screenshot}`);
  }

  return found.selector;
}

export async function attachImages(
  page,
  absPaths,
  { screenshotDir, timeoutMs = 30000, intervalMs = 500 } = {},
) {
  if (!absPaths.length) {
    return { attached: true, count: 0 };
  }

  const selector = await ensureFileInput(page, { screenshotDir });

  try {
    if (typeof page.setFileInput !== 'function') {
      throw new Error('setFileInput is not supported by this Browser Bridge');
    }
    await page.setFileInput(absPaths, selector);
  } catch (error) {
    if (!isRecoverableFileInputError(error)) {
      const screenshot = await captureScreenshot(page, screenshotDir, 'set-file-input-failed');
      throw new CommandExecutionError(`Could not attach images with setFileInput. Screenshot: ${screenshot}`);
    }
    await attachImagesViaDataTransfer(page, selector, absPaths);
  }

  const previews = await waitForPreviews(page, absPaths.length, {
    screenshotDir,
    timeoutMs,
    intervalMs,
  });

  return { attached: true, count: previews.count };
}

export async function waitForPreviews(page, expected, { screenshotDir, timeoutMs = 30000, intervalMs = 500 } = {}) {
  const state = await poll(
    () => evaluateWithArgs(page, WAIT_FOR_PREVIEWS_SCRIPT, { expectedCount: expected }),
    (result) => result?.ready,
    { timeoutMs, intervalMs },
  );

  if (!state?.ready) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'image-previews-not-ready');
    throw new CommandExecutionError(
      `Facebook image previews were not verified (${state?.count || 0}/${expected}). Screenshot: ${screenshot}`,
    );
  }

  return state;
}

export async function attachImagesViaDataTransfer(page, selector, absPaths) {
  const files = absPaths.map((filePath) => ({
    name: path.basename(filePath),
    type: mimeTypeForPath(filePath),
    base64: fs.readFileSync(filePath).toString('base64'),
  }));

  const result = await evaluateWithArgs(page, ATTACH_VIA_DATATRANSFER_SCRIPT, {
    selector,
    files,
  });
  if (!result?.attached) {
    throw new CommandExecutionError(`Image upload failed (base64 fallback): ${result?.reason || 'unknown error'}`);
  }
  return result;
}

export function isRecoverableFileInputError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('unknown action') ||
    message.includes('not supported') ||
    message.includes('set-file-input') ||
    message.includes('not allowed') ||
    message.includes('not-allowed') ||
    message.includes('notallowederror') ||
    message.includes('file input') ||
    message.includes('input') ||
    message.includes('node') ||
    message.includes('not found') ||
    message.includes('detached') ||
    message.includes('dom')
  );
}

export function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}
