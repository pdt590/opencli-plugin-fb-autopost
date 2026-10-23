import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { patchOpencli } from '../scripts/patch-opencli.js';

it('keeps a repo-local host intact across repeated plugin links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-self-link-'));
  try {
    const host = path.join(root, 'node_modules/@jackwener/opencli');
    const dir = path.join(host, 'dist/src');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(host, 'package.json'), JSON.stringify({ name: '@jackwener/opencli', type: 'module' }));
    fs.copyFileSync('node_modules/@jackwener/opencli/dist/src/plugin-runtime.js', path.join(dir, 'plugin-runtime.js'));
    fs.writeFileSync(path.join(dir, 'errors.js'), 'export const getErrorMessage = e => e.message;');
    fs.writeFileSync(path.join(dir, 'logger.js'), 'export const log = { debug() {}, warn() {} };');
    patchOpencli(root);
    patchOpencli(root);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { linkHostOpencli, resolveHostOpencliRoot } from ${JSON.stringify(pathToFileURL(path.join(dir, 'plugin-runtime.js')).href)};
      import assert from 'node:assert/strict';
      assert.equal(linkHostOpencli(${JSON.stringify(root)}), true);
      assert.equal(linkHostOpencli(${JSON.stringify(root)}), true);
      assert.equal(resolveHostOpencliRoot(), ${JSON.stringify(host)});
      assert.equal(linkHostOpencli(${JSON.stringify(path.join(root, 'other-plugin'))}), true);
    `], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(fs.lstatSync(host).isSymbolicLink()).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
