import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { insertCaption } from '../src/composer.js';
import { resolveInputs, resolvePersonInputs } from '../src/validate.js';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-slow-')); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }); });
function browser(text = '') {
  return {
    evaluate: vi.fn(async script => String(script).includes('__opencliPluginArgs') ? { verified: true } : { focused: true, text }),
    insertText: vi.fn(async () => {}),
    screenshot: vi.fn(async ({ path: dest }) => fs.writeFileSync(dest, 'png')),
  };
}

it('types separate Unicode-safe chunks with pauses and verifies the full caption', async () => {
  const page = browser();
  const caption = 'Xin chào 👨‍👩‍👧‍👦!\nĐây là bản nháp e\u0301.';
  const pending = insertCaption(page, caption, { screenshotDir: dir, slow: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(page.insertText).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(199);
  expect(page.insertText).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toMatchObject({ method: 'paced-insertText' });
  const chunks = page.insertText.mock.calls.map(([s]) => s);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.join('')).toBe(caption);
  expect(chunks.some(s => s.includes('👨‍👩‍👧‍👦'))).toBe(true);
});

it('stops after a partial insert failure without appending fallback text or retrying', async () => {
  const page = browser();
  page.insertText.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('bridge interrupted'));
  const result = insertCaption(page, 'Long enough caption to require several chunks.', { screenshotDir: dir, slow: true }).catch(e => e);
  await vi.runAllTimersAsync();
  expect((await result).message).toMatch(/stopped|interrupted/i);
  expect(page.insertText).toHaveBeenCalledTimes(2);
  expect(page.evaluate.mock.calls.some(([s]) => String(s).includes('__opencliPluginArgs'))).toBe(false);
  expect(page.screenshot).toHaveBeenCalledOnce();
});

it('refuses to append to an existing draft in slow mode', async () => {
  const page = browser('Existing caption');
  await expect(insertCaption(page, 'New caption', { screenshotDir: dir, slow: true })).rejects.toThrow(/empty|existing/i);
  expect(page.insertText).not.toHaveBeenCalled();
});

it('appends in order even when the editor restores a stale caret between chunks', async () => {
  const caption = 'First line\nSecond line with emoji 🌿 and accents.';
  let text = ''; let caret = 0;
  const page = browser();
  page.evaluate.mockImplementation(async script => {
    if (String(script).includes('__opencliPluginArgs')) return { verified: text === caption };
    if (String(script).includes('range.collapse(false)')) caret = text.length;
    return { focused: true, text };
  });
  page.insertText.mockImplementation(async chunk => {
    text = text.slice(0, caret) + chunk + text.slice(caret);
    caret = 0; // Model an editor restoring its previous selection after render.
  });
  const pending = insertCaption(page, caption, { screenshotDir: dir, slow: true });
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toMatchObject({ inserted: true });
  expect(text).toBe(caption);
});

it('does not silently fall back when paced input is unavailable', async () => {
  const page = browser(); delete page.insertText;
  await expect(insertCaption(page, 'Caption', { screenshotDir: dir, slow: true })).rejects.toThrow(/insertText|paced/i);
});

it.each([resolveInputs, resolvePersonInputs])('resolves opt-in slow mode for either command', resolve => {
  const input = { caption: 'Draft', 'group-url': 'https://www.facebook.com/groups/test' };
  expect(resolve(input).slow).toBe(false);
  expect(resolve({ ...input, slow: 'true' }).slow).toBe(true);
  expect(resolve({ ...input, slow: 'false' }).slow).toBe(false);
});
