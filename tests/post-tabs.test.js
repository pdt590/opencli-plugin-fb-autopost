import { expect, it, vi } from 'vitest';
vi.mock('@jackwener/opencli/registry', () => ({ cli: vi.fn(), Strategy: { UI: 'ui' } }));
import { postTabs } from '../post-tabs.js';

it('inspects exact retained tabs without closing any', async () => {
  const page = { goto: vi.fn(), selectTab: vi.fn(), closeTab: vi.fn(), evaluate: vi.fn(async () => ({ url: 'https://www.facebook.com/me', text: 'Visible state' })) };
  const rows = await postTabs(page, { tabs: 'one,two', action: 'inspect' });
  expect(rows).toHaveLength(2);
  expect(page.selectTab.mock.calls).toEqual([['one'], ['two']]);
  expect(page.closeTab).not.toHaveBeenCalled();
});
it('closes only supplied task identities and continues after a cleanup error', async () => {
  const page = { goto: vi.fn(), selectTab: vi.fn(), closeTab: vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined) };
  const rows = await postTabs(page, { tabs: 'one,two,two', action: 'close' });
  expect(page.closeTab.mock.calls).toEqual([['one'], ['two']]);
  expect(rows[0]).toMatchObject({ task_tab: 'one', tab_closed: false, error: 'unavailable' });
  expect(rows[1]).toMatchObject({ task_tab: 'two', tab_closed: true });
});
it('rejects empty targets and unknown actions before touching the browser', async () => {
  const page = { goto: vi.fn(), selectTab: vi.fn() };
  await expect(postTabs(page, { tabs: '' })).rejects.toThrow();
  await expect(postTabs(page, { tabs: 'one', action: 'all' })).rejects.toThrow();
  expect(page.selectTab).not.toHaveBeenCalled();
});
it('closes personal and group tabs even when selection is rejected by the automation container', async () => {
  const page = {
    goto: vi.fn(),
    selectTab: vi.fn().mockRejectedValue(new Error('Page is not in the automation container')),
    closeTab: vi.fn().mockResolvedValue(undefined),
  };
  const rows = await postTabs(page, { tabs: 'personal,group', action: 'close' });
  expect(rows).toEqual([
    { task_tab: 'personal', tab_closed: true },
    { task_tab: 'group', tab_closed: true },
  ]);
  expect(page.selectTab).not.toHaveBeenCalled();
  expect(page.closeTab.mock.calls).toEqual([['personal'], ['group']]);
});
