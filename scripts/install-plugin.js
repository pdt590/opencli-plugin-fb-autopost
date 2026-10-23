#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultRunCommand, localOpenCliPath } from '../src/opencli-command.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = localOpenCliPath(root);
let result = defaultRunCommand(command, ['plugin', 'install', pathToFileURL(root).href], { cwd: root });
if (result.status !== 0 && /Plugin\s+"?social-autopost"?\s+is already installed/i.test(result.output.replaceAll('\\"', '"'))) {
  result = defaultRunCommand(command, ['plugin', 'update', 'social-autopost'], { cwd: root });
}
process.stdout.write(result.output);
process.exitCode = result.status;
