#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function patchOpencli(repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const runtime = path.join(repoRoot, 'node_modules/@jackwener/opencli/dist/src/plugin-runtime.js');
  const source = fs.readFileSync(runtime, 'utf8');
  // Local plugin installation prunes devDependencies, including its own running
  // host. Preserve this workspace install; other plugins keep normal npm setup.
  const installer = path.join(path.dirname(runtime), 'plugin.js');
  if (fs.existsSync(installer)) {
    const code = fs.readFileSync(installer, 'utf8');
    const installMarker = '// social-autopost: do not prune the running workspace host';
    const installAnchor = 'function installDependencies(dir) {';
    if (!code.includes(installMarker)) {
      if (!code.includes(installAnchor)) throw new Error('OpenCLI installer changed; cannot safely apply the host-prune fix.');
      fs.writeFileSync(installer, code.replace(installAnchor, `${installAnchor}
    ${installMarker}
    const workspaceHost = path.join(dir, 'node_modules', '@jackwener', 'opencli');
    if (fs.existsSync(workspaceHost) && fs.realpathSync(workspaceHost) === fs.realpathSync(resolveHostOpencliRoot())) return;
`));
    }
  }
  const marker = '// social-autopost: preserve a host installed inside the plugin itself';
  if (source.includes(marker)) return;
  const anchor = "const current = fs.lstatSync(targetLink, { throwIfNoEntry: false });";
  if (!source.includes(anchor)) throw new Error('OpenCLI runtime changed; cannot safely apply the self-link fix.');
  const guard = `${marker}
        if (fs.existsSync(targetLink) && fs.realpathSync(targetLink) === fs.realpathSync(hostRoot)) return true;
        `;
  fs.writeFileSync(runtime, source.replace(anchor, guard + anchor));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) patchOpencli();
