import { cli, Strategy } from '@jackwener/opencli/registry';
import { verifyPersonalProfileLoaded } from './src/personal-profile.js';
import { runPost } from './src/post-flow.js';
import { resolvePersonInputs } from './src/validate.js';

export async function personPost(first, second) {
  return runPost(first, second, {
    commandName: 'person-post',
    resolveInput: resolvePersonInputs,
    verifyTarget: verifyPersonalProfileLoaded,
    resultTarget: 'profileUrl',
  });
}

cli({
  site: 'facebook', name: 'person-post', access: 'write',
  description: 'Prepare a post on your personal Facebook profile (dry-run by default; --confirm true to publish)',
  domain: 'www.facebook.com', strategy: Strategy.UI, browser: true,
  defaultWindowMode: 'foreground', defaultFormat: 'json',
  args: [
    { name: 'defer-close', type: 'boolean', default: false, help: 'Keep task tab after outcome checks; use with --site-session persistent for later cleanup' },
    { name: 'slow', type: 'boolean', default: false, help: 'Paced caption input and review pauses; no detection guarantees' },
    { name: 'caption', type: 'string', help: 'Caption text (exclusive with --caption-file)' },
    { name: 'caption-file', type: 'string', help: 'Path to UTF-8 caption file' },
    { name: 'images', type: 'string', help: 'Comma-separated local image paths, max 10 (jpg/jpeg/png/webp/gif)' },
    { name: 'dry-run', type: 'boolean', default: false, help: 'Prepare composer without clicking Post (default mode)' },
    { name: 'confirm', type: 'boolean', default: false, help: 'Set --confirm true to publish once' },
    { name: 'screenshot-dir', type: 'string', default: './artifacts/facebook-person-post', help: 'Artifact directory' },
  ],
  columns: ['status', 'mode', 'profile_url', 'message', 'caption_length', 'image_count', 'screenshot'],
  func: personPost,
});
