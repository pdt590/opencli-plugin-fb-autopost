#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function patchOpencli(repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const runtime = path.join(repoRoot, 'node_modules/@jackwener/opencli/dist/src/plugin-runtime.js');
  const source = fs.readFileSync(runtime, 'utf8');
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
