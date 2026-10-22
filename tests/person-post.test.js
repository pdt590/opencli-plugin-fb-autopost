import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({ Strategy: { UI: 'ui' }, cli: vi.fn() }));
let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-person-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); vi.clearAllMocks(); });

function page({ target = {}, live = false, images = false, security = {}, finalSecurity = {} } = {}) {
  const normal = { url: 'https://www.facebook.com/test.user/', bodyText: 'Edit profile Add to story' };
  const plain = [
    { ...normal, ...security },
    { url: normal.url, hasComposer: true, ownProfile: true, ...target },
    { found: true }, { focused: true },
    ...(images ? [{ found: true, selector: 'input[type="file"][data-opencli-fb-autopost-file-input="active"]' }] : []),
    { ...normal, ...finalSecurity }, ...(live ? [{ status: 'posted', message: 'Composer closed.' }] : []),
  ];
  const args = [{ clicked: true }, { verified: true },
    ...(images ? [{ ready: true, count: 1 }, { verified: true }] : []),
    ...(live ? [{ found: true, enabled: true }, { clicked: true }] : [])];
  return {
    newTab: vi.fn(async () => 'owned-tab'), selectTab: vi.fn(), closeTab: vi.fn(),
    goto: vi.fn(), insertText: vi.fn(), setFileInput: vi.fn(),
    evaluate: vi.fn(async script => {
      if (String(script).includes('range.collapse(false)')) return { focused: true };
      return String(script).includes('__opencliPluginArgs') ? args.shift() : plain.shift();
    }),
    screenshot: vi.fn(async ({ path: dest }) => fs.writeFileSync(dest, 'png')),
  };
}
const kwargs = () => ({ caption: 'Personal draft test', 'screenshot-dir': tmpDir });

describe('person-post production flow', () => {
  it('registers a write command and defaults to a reviewable own-profile dry-run', async () => {
    const { personPost } = await import('../person-post.js');
    const browser = page();
    const [result] = await personPost(browser, kwargs());
    expect(browser.goto).toHaveBeenCalledWith('https://www.facebook.com/me', expect.any(Object));
    expect(browser.insertText).toHaveBeenCalledWith('Personal draft test');
    expect(result).toMatchObject({ status: 'dry-run-ready', mode: 'dry-run', profile_url: 'https://www.facebook.com/test.user/', image_count: 0 });
    expect(result).not.toHaveProperty('group_url');
    expect(browser.closeTab).toHaveBeenCalledWith('owned-tab');
    expect(browser.newTab).toHaveBeenCalledWith();
    expect(browser.screenshot).not.toHaveBeenCalled();
    expect(result.screenshot).toBeNull();
    expect(browser.evaluate.mock.calls.some(([s]) => String(s).includes('button-not-found-or-disabled'))).toBe(false);
    const { cli } = await import('@jackwener/opencli/registry');
    expect(cli).toHaveBeenCalledWith(expect.objectContaining({ site: 'facebook', name: 'person-post', access: 'write', browser: true }));
  });
  it('attaches local images and rechecks caption before returning dry-run', async () => {
    const { personPost } = await import('../person-post.js');
    const image = path.join(tmpDir, 'test.png'); fs.writeFileSync(image, 'image');
    const browser = page({ images: true });
    const [result] = await personPost(browser, { ...kwargs(), images: image });
    expect(browser.setFileInput).toHaveBeenCalledWith([image], expect.any(String));
    expect(result).toMatchObject({ status: 'dry-run-ready', image_count: 1 });
    expect(result.screenshot).toBeNull();
    expect(browser.screenshot).not.toHaveBeenCalled();
  });
  it('executes one Post click only with explicit confirmation', async () => {
    const { personPost } = await import('../person-post.js');
    const browser = page({ live: true });
    const [result] = await personPost(browser, { ...kwargs(), confirm: true });
    expect(result).toMatchObject({ status: 'posted', mode: 'live' });
    expect(browser.screenshot).toHaveBeenCalledOnce();
    expect(browser.screenshot.mock.invocationCallOrder[0]).toBeLessThan(browser.closeTab.mock.invocationCallOrder[0]);
    expect(browser.evaluate.mock.calls.filter(([s]) => String(s).includes('button-not-found-or-disabled'))).toHaveLength(1);
  });
  it('preserves the live result when only tab cleanup fails', async () => {
    const { personPost } = await import('../person-post.js');
    const browser = page({ live: true });
    browser.closeTab.mockRejectedValue(new Error('bridge unavailable'));
    const [result] = await personPost(browser, { ...kwargs(), confirm: true });
    expect(result).toMatchObject({ status: 'posted', tab_closed: false });
    expect(result.cleanup_warning).toMatch(/do not repeat/);
    expect(browser.closeTab).toHaveBeenCalledOnce();
  });
  it.each(['person', 'group'])('retains the %s task tab after checking its outcome when cleanup is deferred', async kind => {
    const func = kind === 'person' ? (await import('../person-post.js')).personPost : (await import('../group-post.js')).groupPost;
    const browser = page({ live: true, target: kind === 'group' ? { url: 'https://www.facebook.com/groups/test', hasHeading: true } : {} });
    const [result] = await func(browser, { ...kwargs(), 'group-url': 'https://www.facebook.com/groups/test', confirm: true, 'defer-close': true });
    expect(result).toMatchObject({ status: 'posted', task_tab: 'owned-tab', tab_closed: false, cleanup_deferred: true });
    expect(browser.screenshot).toHaveBeenCalledOnce();
    expect(browser.closeTab).not.toHaveBeenCalled();
  });
  it('does not close existing tabs if task-tab creation fails', async () => {
    const { personPost } = await import('../person-post.js');
    const browser = page(); browser.newTab.mockRejectedValue(new Error('creation failed'));
    await expect(personPost(browser, kwargs())).rejects.toThrow('creation failed');
    expect(browser.closeTab).not.toHaveBeenCalled();
    expect(browser.goto).not.toHaveBeenCalled();
  });
  it.each([
    { ownProfile: false },
    { url: 'https://www.facebook.com/groups/test/' },
    { url: 'https://example.com/test/' },
    { hasComposer: false },
  ])('refuses an unverified own personal profile %j', async target => {
    const { personPost } = await import('../person-post.js');
    const browser = page({ target });
    await expect(personPost(browser, kwargs())).rejects.toThrow(/personal profile/i);
    expect(browser.insertText).not.toHaveBeenCalled();
    expect(browser.closeTab).toHaveBeenCalledWith('owned-tab');
  });
  it('stops at login before filling the composer', async () => {
    const { personPost } = await import('../person-post.js');
    const browser = page({ security: { url: 'https://www.facebook.com/login/' } });
    await expect(personPost(browser, kwargs())).rejects.toThrow();
    expect(browser.insertText).not.toHaveBeenCalled();
  });
  it('rejects conflicting confirmation flags before navigation', async () => {
    const { personPost } = await import('../person-post.js');
    const browser = page();
    await expect(personPost(browser, { ...kwargs(), confirm: true, 'dry-run': true })).rejects.toThrow(/either/);
    expect(browser.goto).not.toHaveBeenCalled();
    expect(browser.newTab).not.toHaveBeenCalled();
  });
  it('includes the new adapter in distributable packages', async () => {
    const { packageEntries } = await import('../scripts/package-local.js');
    expect(packageEntries()).toContain('person-post.js');
  });
  it.each(['person', 'group'])('prepares a paced %s dry-run through the shared production flow', async kind => {
    vi.useFakeTimers();
    try {
      const func = kind === 'person' ? (await import('../person-post.js')).personPost : (await import('../group-post.js')).groupPost;
      const browser = page({ target: kind === 'group' ? { url: 'https://www.facebook.com/groups/test', hasHeading: true } : {} });
      const pending = func(browser, { ...kwargs(), 'group-url': 'https://www.facebook.com/groups/test', slow: true });
      await vi.advanceTimersByTimeAsync(599);
      expect(browser.insertText).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect((await pending)[0].status).toBe('dry-run-ready');
      expect(browser.insertText.mock.calls.map(([text]) => text).join('')).toBe('Personal draft test');
      expect(browser.insertText.mock.calls.length).toBeGreaterThan(1);
    } finally { vi.useRealTimers(); }
  });
  it('rechecks security after the review pause and stops a confirmed post at a checkpoint', async () => {
    vi.useFakeTimers();
    try {
      const { personPost } = await import('../person-post.js');
      const browser = page({ live: true, finalSecurity: { url: 'https://www.facebook.com/checkpoint/' } });
      const pending = personPost(browser, { ...kwargs(), slow: true, confirm: true }).catch(error => error);
      await vi.runAllTimersAsync();
      expect((await pending).message).toMatch(/checkpoint/i);
      expect(browser.evaluate.mock.calls.some(([script]) => String(script).includes('button-not-found-or-disabled'))).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});

describe('personal target verification', () => {
  it.each([
    ['https://www.facebook.com/test.user/', true],
    ['https://www.facebook.com/profile.php?id=12345', true],
    ['https://www.facebook.com/groups/123/', false],
    ['https://www.facebook.com/pages/', false],
    ['https://www.facebook.com/me', false],
    ['https://www.facebook.com/profile.php', false],
    ['https://facebook.com.evil.test/user/', false],
    ['http://www.facebook.com/user/', false],
  ])('validates resolved URL %s', async (url, expected) => {
    const { isPersonalProfileUrl } = await import('../src/personal-profile.js');
    expect(isPersonalProfileUrl(url)).toBe(expected);
  });
  it.each([
    [['Edit profile', 'Add to story', "What's on your mind?"], true],
    [['Chỉnh sửa trang cá nhân', 'Thêm vào tin', 'Bạn đang nghĩ gì?'], true],
    [['Manage Page', 'Create post'], false],
    [['Edit profile', "What's on your mind?"], false],
  ])('checks observed owner controls in the DOM %j', async (labels, allowed) => {
    const { verifyPersonalProfileLoaded } = await import('../src/personal-profile.js');
    const browser = {
      evaluate: async script => vm.runInNewContext(script, {
        location: { href: 'https://www.facebook.com/test.user/' },
        getComputedStyle: () => ({ visibility: 'visible' }),
        document: { querySelectorAll: () => labels.map(innerText => ({ innerText, getClientRects: () => [1] })) },
      }),
      screenshot: vi.fn(async ({ path: dest }) => fs.writeFileSync(dest, 'png')),
    };
    if (allowed) {
      await expect(verifyPersonalProfileLoaded(browser, '/me', { screenshotDir: tmpDir })).resolves.toMatchObject({ ownProfile: true, hasComposer: true });
    } else {
      await expect(verifyPersonalProfileLoaded(browser, '/me', { screenshotDir: tmpDir })).rejects.toThrow(/personal profile/);
    }
  });
});
