import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { normalizeInvocation } from './src/post-flow.js';
import { readArg } from './src/validate.js';

export async function postTabs(first, second) {
  const { page, kwargs } = normalizeInvocation(first, second);
  const tabs = [...new Set(String(readArg(kwargs, 'tabs') || '').split(',').map(x => x.trim()).filter(Boolean))];
  const action = readArg(kwargs, 'action') || 'inspect';
  if (!tabs.length || !['inspect', 'close'].includes(action)) throw new ArgumentError('Supply --tabs with exact task_tab identities and --action inspect or close');
  const rows = [];
  for (const tab of tabs) {
    try {
      if (action === 'close') {
        await page.closeTab(tab);
        rows.push({ task_tab: tab, tab_closed: true });
      } else {
        await page.selectTab(tab);
        const state = await page.evaluate(`(() => ({ url: location.href, text: (document.body?.innerText || '').slice(0, 12000) }))()`);
        rows.push({ task_tab: tab, tab_closed: false, ...state });
      }
    } catch (error) {
      rows.push({ task_tab: tab, tab_closed: false, error: error.message });
    }
  }
  return rows;
}

cli({
  site: 'facebook', name: 'post-tabs', access: 'write',
  description: 'Inspect or close exact retained posting tabs in the persistent Facebook adapter session',
  domain: 'www.facebook.com', strategy: Strategy.UI, browser: true, defaultFormat: 'json',
  args: [
    { name: 'tabs', type: 'string', required: true, help: 'Comma-separated task_tab identities returned by this task' },
    { name: 'action', type: 'string', default: 'inspect', help: 'inspect or close; always pass --site-session persistent' },
  ],
  func: postTabs,
});
