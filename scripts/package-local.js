#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_OUT_DIR = 'dist';
export const PACKAGE_NAME = 'social-autopost-local';

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    outDir: DEFAULT_OUT_DIR,
    repoRoot: REPO_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--out-dir') args.outDir = readValue(argv, ++index, arg);
    else if (arg === '--repo-root') args.repoRoot = path.resolve(readValue(argv, ++index, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown package option: ${arg}`);
  }

  return args;
}

export function usage() {
  return [
    'Usage:',
    '  npm run package',
    '  npm run package -- --dry-run',
    '  node scripts/package-local.js --dry-run',
    '',
    'Creates a local tar.gz bundle for handoff to a nontechnical local user.',
  ].join('\n');
}

export async function runPackageLocal({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  runCommand = defaultRunCommand,
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
    const result = packageLocal(args, runCommand);
    stdout.write(`${formatPackageResult(result)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

export function packageLocal({ repoRoot = REPO_ROOT, outDir = DEFAULT_OUT_DIR, dryRun = false } = {}, runCommand = defaultRunCommand) {
  const absoluteRepo = path.resolve(repoRoot);
  const absoluteOut = path.resolve(absoluteRepo, outDir);
  const archivePath = path.join(absoluteOut, `${PACKAGE_NAME}.tar.gz`);
  const entries = packageEntries();

  if (!dryRun) {
    fs.mkdirSync(absoluteOut, { recursive: true });
    const result = runCommand('tar', ['-czf', archivePath, ...entries], { cwd: absoluteRepo });
    if (result.status !== 0) {
      throw new Error(`Could not create local package: ${result.output || 'tar failed'}`);
    }
  }

  return {
    dryRun,
    archivePath,
    entries,
    nextSteps: [
      'Copy the archive to the local office/laptop machine.',
      'Extract it, then run: npm install',
      'Continue with README.md.',
    ],
  };
}

export function packageEntries() {
  return [
    'README.md',
    'LICENSE',
    'NOTICE.md',
    'THIRD_PARTY_NOTICES.md',
    'SECURITY.md',
    'package.json',
    'package-lock.json',
    'opencli-plugin.json',
    'group-post.js',
    'person-post.js',
    'post-tabs.js',
    'src',
    'worker',
    'scripts',
    'tests',
    'docs',
    'config',
    'examples',
    'skills',
    'artifacts/.gitkeep',
    'install.sh',
    'uninstall.sh',
    'install.ps1',
    'uninstall.ps1',
  ];
}

export function formatPackageResult(result) {
  const action = result.dryRun ? 'Would create' : 'Created';
  return [
    `${action} local package: ${result.archivePath}`,
    'Included:',
    ...result.entries.map((entry) => `- ${entry}`),
    'Next steps:',
    ...result.nextSteps.map((step) => `- ${step}`),
  ].join('\n');
}

export function defaultRunCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
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
  const status = await runPackageLocal();
  process.exitCode = status;
}
