import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_DIALOG_HELPERS, evaluateWithArgs } from '../src/composer.js';
import { isRecoverableFileInputError } from '../src/images.js';

vi.mock('@jackwener/opencli/registry', () => ({
  Strategy: { UI: 'ui' },
  cli: vi.fn(),
}));

let postGroup;
let tmpDir;

beforeEach(async () => {
  ({ postGroup } = await import('../post-group.js'));
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-flow-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function makePage({ evaluate = [], evaluateWithArgs = [] } = {}) {
  const evaluateQueue = [...evaluate];
  const evaluateWithArgsQueue = [...evaluateWithArgs];
  const plainScripts = [];
  const argScripts = [];
  return {
    newTab: vi.fn(async () => 'owned-group-tab'), selectTab: vi.fn(), closeTab: vi.fn(),
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(async (script) => {
      const source = String(script);
      if (source.includes('__opencliPluginArgs')) {
        argScripts.push(source);
        return evaluateWithArgsQueue.shift();
      }
      plainScripts.push(source);
      return evaluateQueue.shift();
    }),
    evaluateWithArgs: vi.fn(),
    insertText: vi.fn().mockResolvedValue(undefined),
    setFileInput: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn(async ({ path: screenshotPath }) => {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, 'png');
    }),
    __queueEvaluate(values) {
      evaluateQueue.length = 0;
      for (const value of values) {
        evaluateQueue.push(value);
      }
    },
    __queueEvaluateWithArgs(values) {
      evaluateWithArgsQueue.length = 0;
      for (const value of values) {
        evaluateWithArgsQueue.push(value);
      }
    },
    __plainScripts: plainScripts,
    __argScripts: argScripts,
  };
}

function baseArgs(overrides = {}) {
  return {
    'group-url': 'https://www.facebook.com/groups/test',
    caption: 'Test draft only. Do not publish.',
    'screenshot-dir': tmpDir,
    __timing: {
      captionTimeoutMs: 5,
      captionIntervalMs: 1,
      postOutcomeTimeoutMs: 5,
      postOutcomeIntervalMs: 1,
    },
    ...overrides,
  };
}

describe('postGroup flow', () => {
  it('prepares a dry-run and never clicks Post', async () => {
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      normalPageState(),
    ]);
    page.__queueEvaluateWithArgs([{ clicked: true }, { verified: true }]);

    const rows = await postGroup(page, baseArgs());

    expect(page.goto).toHaveBeenCalledWith('https://www.facebook.com/groups/test', {
      waitUntil: 'load',
      settleMs: 3000,
    });
    expect(page.insertText).toHaveBeenCalledWith('Test draft only. Do not publish.');
    expect(page.setFileInput).not.toHaveBeenCalled();
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(rows[0].screenshot).toBeNull();
    expect(page.__argScripts[0]).toContain("getAttribute('aria-hidden') === 'true'");
    expect(page.__argScripts[0]).toContain('score(candidate.text)');
    expect(rows[0]).toMatchObject({
      status: 'dry-run-ready',
      mode: 'dry-run',
      image_count: 0,
    });
  });

  it('attaches images in dry-run, waits for previews, rechecks caption, and never clicks Post', async () => {
    const firstImage = writeImage('one.jpg');
    const secondImage = writeImage('two.png');
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      { found: true, selector: activeFileInputSelector() },
      normalPageState(),
    ]);
    page.__queueEvaluateWithArgs([
      { clicked: true },
      { verified: true },
      { ready: true, count: 2 },
      { verified: true },
    ]);

    const rows = await postGroup(page, baseArgs({ images: `${firstImage},${secondImage}` }));

    expect(page.setFileInput).toHaveBeenCalledWith([firstImage, secondImage], activeFileInputSelector());
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      status: 'dry-run-ready',
      mode: 'dry-run',
      image_count: 2,
    });
    expect(countArgScripts(page, 'const expectedCount = __opencliPluginArgs["expectedCount"];')).toBe(1);
    expect(countArgScripts(page, 'const caption = __opencliPluginArgs["caption"];')).toBe(2);
    expect(countArgScripts(page, 'button-not-found-or-disabled')).toBe(0);
  });

  it('falls back to DataTransfer when CDP file input upload is not allowed', async () => {
    const imagePath = writeImage('fallback.jpg');
    const page = makePage();
    page.setFileInput.mockRejectedValue(new Error('NotAllowedError: Not allowed'));
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      { found: true, selector: activeFileInputSelector() },
      normalPageState(),
    ]);
    page.__queueEvaluateWithArgs([
      { clicked: true },
      { verified: true },
      { attached: true, count: 1 },
      { ready: true, count: 1 },
      { verified: true },
    ]);

    const rows = await postGroup(page, baseArgs({ images: imagePath }));

    expect(page.setFileInput).toHaveBeenCalledWith([imagePath], activeFileInputSelector());
    expect(page.__argScripts.some((script) => script.includes('new DataTransfer()'))).toBe(true);
    expect(rows[0]).toMatchObject({
      status: 'dry-run-ready',
      mode: 'dry-run',
      image_count: 1,
    });
  });

  it('requires confirm mode before clicking Post and reports posted outcome', async () => {
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      normalPageState(),
      { status: 'posted', message: 'Composer closed after clicking Post.' },
    ]);
    page.__queueEvaluateWithArgs([
      { clicked: true },
      { verified: true },
      { found: true, enabled: true, label: 'post' },
      { clicked: true, label: 'post' },
    ]);

    const rows = await postGroup(page, baseArgs({ confirm: true }));

    expect(rows[0]).toMatchObject({
      status: 'posted',
      mode: 'live',
    });
    expect(page.evaluate).toHaveBeenCalled();
  });

  it('reports pending-review after one verified live Post click', async () => {
    const imagePath = writeImage('pending.jpg');
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      { found: true, selector: activeFileInputSelector() },
      normalPageState(),
      { status: 'pending-review', message: 'Facebook says the post is pending review.' },
    ]);
    page.__queueEvaluateWithArgs([
      { clicked: true },
      { verified: true },
      { ready: true, count: 1 },
      { verified: true },
      { found: true, enabled: true, label: 'post' },
      { clicked: true, label: 'post' },
    ]);

    const rows = await postGroup(page, baseArgs({ images: imagePath, confirm: true }));

    expect(rows[0]).toMatchObject({
      status: 'pending-review',
      mode: 'live',
      image_count: 1,
    });
    expect(countArgScripts(page, 'button-not-found-or-disabled')).toBe(1);
    const postClickIndex = page.__argScripts.findIndex((script) => script.includes('button-not-found-or-disabled'));
    const previewIndex = page.__argScripts.findIndex((script) =>
      script.includes('const expectedCount = __opencliPluginArgs["expectedCount"];'),
    );
    const captionVerifyIndices = page.__argScripts
      .map((script, index) => (script.includes('const caption = __opencliPluginArgs["caption"];') ? index : -1))
      .filter((index) => index >= 0);
    expect(previewIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeLessThan(postClickIndex);
    expect(Math.max(...captionVerifyIndices)).toBeLessThan(postClickIndex);
  });

  it('aborts on a mid-flow blocked state before live post click', async () => {
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      { url: 'https://www.facebook.com/groups/test', title: '', bodyText: 'Action blocked' },
    ]);
    page.__queueEvaluateWithArgs([{ clicked: true }, { verified: true }]);

    await expect(postGroup(page, baseArgs({ confirm: true }))).rejects.toThrow(/blocked/);
    expect(page.evaluate).toHaveBeenCalled();
    expect(page.screenshot).toHaveBeenCalled();
  });

  it('aborts before live Post click if caption disappears after image upload', async () => {
    const imagePath = writeImage('caption-lost.jpg');
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
      { found: true, selector: activeFileInputSelector() },
    ]);
    page.__queueEvaluateWithArgs([
      { clicked: true },
      { verified: true },
      { ready: true, count: 1 },
      { verified: false },
    ]);

    await expect(
      postGroup(page, baseArgs({
        images: imagePath,
        confirm: true,
        __timing: {
          captionTimeoutMs: 0,
          captionIntervalMs: 0,
        },
      })),
    ).rejects.toThrow(/Caption was not verified after attaching images/);

    expect(page.setFileInput).toHaveBeenCalledWith([imagePath], activeFileInputSelector());
    expect(countArgScripts(page, 'button-not-found-or-disabled')).toBe(0);
    expect(page.screenshot).toHaveBeenCalled();
  });

  it('rejects dry-run and confirm conflict before browser navigation', async () => {
    const page = makePage();

    await expect(postGroup(page, baseArgs({ 'dry-run': true, confirm: true }))).rejects.toThrow(
      /either --dry-run true or --confirm true/,
    );

    expect(page.goto).not.toHaveBeenCalled();
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it('aborts caption verification failure before image upload', async () => {
    const imagePath = path.join(tmpDir, 'test.jpg');
    fs.writeFileSync(imagePath, 'image');
    const page = makePage();
    page.__queueEvaluate([
      normalPageState(),
      groupLoadedState(),
      { found: true, editorText: '' },
      { focused: true },
    ]);
    page.__queueEvaluateWithArgs([
      { clicked: true },
      { verified: false },
      { inserted: true },
      { verified: false },
      { inserted: true },
      { verified: false },
    ]);

    await expect(
      postGroup(page, baseArgs({
        images: imagePath,
        __timing: {
          captionTimeoutMs: 0,
          captionIntervalMs: 0,
        },
      })),
    ).rejects.toThrow(/Caption was not verified/);

    expect(page.setFileInput).not.toHaveBeenCalled();
    expect(page.screenshot).toHaveBeenCalled();
  });

  it('keeps evaluateWithArgs declarations inside a function scope for repeated Brave evaluations', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue('ok'),
    };

    await evaluateWithArgs(page, '(() => labels.length)()', { labels: ['Post'] });
    await evaluateWithArgs(page, '(() => labels.length)()', { labels: ['Share'] });

    expect(page.evaluate).toHaveBeenCalledTimes(2);
    for (const [script] of page.evaluate.mock.calls) {
      const source = String(script).trimStart();
      expect(source.startsWith('((__opencliPluginArgs) => {')).toBe(true);
      expect(source.startsWith('const labels')).toBe(false);
      expect(source).toContain('const labels = __opencliPluginArgs["labels"];');
    }
  });

  it('keeps active dialog matching scoped to visible composer dialogs', () => {
    expect(ACTIVE_DIALOG_HELPERS).toContain("getAttribute('aria-hidden') === 'true'");
    expect(ACTIVE_DIALOG_HELPERS).toContain("querySelector('[contenteditable=\"true\"][role=\"textbox\"], [contenteditable=\"true\"]')");
    expect(ACTIVE_DIALOG_HELPERS).toContain('filter(elementVisible)');
    expect(ACTIVE_DIALOG_HELPERS).toContain('b.zIndex - a.zIndex');
  });

  it('classifies CDP not-allowed file-input failures as recoverable', () => {
    expect(isRecoverableFileInputError(new Error('NotAllowedError: Not allowed'))).toBe(true);
    expect(isRecoverableFileInputError(new Error('ProtocolError: not-allowed'))).toBe(true);
    expect(isRecoverableFileInputError(new Error('Permission denied'))).toBe(false);
  });
});

function normalPageState() {
  return {
    url: 'https://www.facebook.com/groups/test',
    title: 'Test Group | Facebook',
    bodyText: 'Write something Photo/video',
  };
}

function groupLoadedState() {
  return {
    url: 'https://www.facebook.com/groups/test',
    hasHeading: true,
    text: 'Test Group',
  };
}

function writeImage(name) {
  const imagePath = path.join(tmpDir, name);
  fs.writeFileSync(imagePath, 'image');
  return path.resolve(imagePath);
}

function activeFileInputSelector() {
  return 'input[type="file"][data-opencli-social-autopost-file-input="active"]';
}

function countArgScripts(page, text) {
  return page.__argScripts.filter((script) => script.includes(text)).length;
}
