#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const SKILL_RELATIVE_PATH = path.join('hermes', 'skills', 'social-media', 'facebook-group-post');
export const TARGET_RELATIVE_PATH = path.join('.hermes', 'skills', 'social-media', 'facebook-group-post');
export const HERMES_ENV_RELATIVE_PATH = path.join('.hermes', '.env');

export function parseArgs(argv) {
  const args = {
    mode: 'copy',
    dryRun: false,
    force: false,
    home: os.homedir(),
    repoRoot: REPO_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--mode') args.mode = readValue(argv, ++index, arg);
    else if (arg === '--home') args.home = path.resolve(readValue(argv, ++index, arg));
    else if (arg === '--repo-root') args.repoRoot = path.resolve(readValue(argv, ++index, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown install option: ${arg}`);
  }

  if (!['copy', 'symlink'].includes(args.mode)) {
    throw new Error('--mode must be copy or symlink');
  }

  return args;
}

export function usage() {
  return [
    'Usage:',
    '  node scripts/install-hermes-skill.js',
    '  node scripts/install-hermes-skill.js --mode symlink --force',
    '',
    'Options:',
    '  --dry-run          Print actions without writing files',
    '  --force            Replace an existing installed skill directory',
    '  --mode <copy|symlink>  Install by copying files or creating a symlink (default: copy)',
    '  --home <dir>       Override HOME for tests or custom Hermes homes',
  ].join('\n');
}

export async function runInstallHermesSkill({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n\n${usage()}\n`);
    return 2;
  }

  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  try {
    const result = installHermesSkill(args);
    stdout.write(`${formatInstallResult(result)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

export function installHermesSkill({
  mode = 'copy',
  dryRun = false,
  force = false,
  home = os.homedir(),
  repoRoot = REPO_ROOT,
} = {}) {
  const source = path.join(repoRoot, SKILL_RELATIVE_PATH);
  const target = path.join(home, TARGET_RELATIVE_PATH);
  const envPath = path.join(home, HERMES_ENV_RELATIVE_PATH);

  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    throw new Error(`Skill source is missing: ${path.join(source, 'SKILL.md')}`);
  }

  const targetExists = fs.existsSync(target);
  if (targetExists && !force && !dryRun) {
    throw new Error(`Hermes skill already exists at ${target}. Re-run with --force to replace it.`);
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (targetExists) {
      fs.rmSync(target, { recursive: true, force: true });
    }

    if (mode === 'symlink') {
      fs.symlinkSync(source, target, 'dir');
    } else {
      fs.cpSync(source, target, { recursive: true });
    }
    upsertEnvValue(envPath, 'FB_AUTOPOST_REPO', repoRoot);
  }

  return {
    dryRun,
    mode,
    source,
    target,
    envPath,
    nextCommand: 'hermes skills list',
  };
}

export function formatInstallResult(result) {
  const action = result.dryRun ? 'Would install' : 'Installed';
  return [
    `${action} Hermes skill facebook-group-post`,
    `Mode: ${result.mode}`,
    `Source: ${result.source}`,
    `Target: ${result.target}`,
    `Hermes repo path: ${result.envPath}`,
    `Verify: ${result.nextCommand}`,
  ].join('\n');
}

export function upsertEnvValue(envPath, key, value) {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = current.split(/\r?\n/).filter((line, index, all) => (
    line !== '' || index < all.length - 1
  ));
  const assignment = `${key}=${quoteEnvValue(value)}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = assignment;
  else lines.push(assignment);
  fs.writeFileSync(envPath, `${lines.filter(Boolean).join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
}

function quoteEnvValue(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function isMain(metaUrl) {
  return fileURLToPath(metaUrl) === process.argv[1];
}

if (isMain(import.meta.url)) {
  const status = await runInstallHermesSkill();
  process.exitCode = status;
}
