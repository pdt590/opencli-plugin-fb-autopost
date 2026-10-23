import { cli, Strategy } from '@jackwener/opencli/registry';
import { verifyGroupPageLoaded } from './src/composer.js';
import { resolveInputs } from './src/validate.js';
import { runPost, normalizeInvocation } from './src/post-flow.js';
export { normalizeInvocation } from './src/post-flow.js';

export async function groupPost(first, second) {
  return runPost(first, second, {
    commandName: 'group-post',
    resolveInput: kwargs => { const input = resolveInputs(kwargs); return { ...input, targetUrl: input.groupUrl }; },
    verifyTarget: verifyGroupPageLoaded,
    resultTarget: 'groupUrl',
  });
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
    { name: 'timeout', type: 'int', default: 600, help: 'Total command budget in seconds for slow caption input, image upload and outcome verification' },
    { name: 'defer-close', type: 'boolean', default: false, help: 'Keep task tab after outcome checks; use with --site-session persistent for later cleanup' },
    { name: 'slow', type: 'boolean', default: false, help: 'Paced caption input and review pauses; no detection guarantees' },
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
