#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalConfig } from '../src/local-config.js';
import {
  buildOpenCliArgs,
  buildRejectedResult,
  buildWorkerResult,
  normalizeJob,
} from '../src/job.js';
import { resolveOpenCliCommand } from '../src/opencli-command.js';
import { coerceBoolean } from '../src/validate.js';

const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(WORKER_DIR, '..');

export function parseArgs(argv) {
  const args = {
    confirm: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--job') args.job = readValue(argv, ++index, arg);
    else if (arg === '--confirm') args.confirm = coerceBoolean(readValue(argv, ++index, arg));
    else if (arg === '--cwd') args.cwd = path.resolve(readValue(argv, ++index, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown worker option: ${arg}`);
  }

  return args;
}

export function usage() {
  return [
    'Usage:',
    '  node worker/posting-worker.js --job examples/job.dry-run.json',
    '  node worker/posting-worker.js --job examples/job.live.json --confirm true',
    '',
    'The worker accepts one local JSON job and calls opencli facebook group-post.',
    'Live jobs require both "mode": "live" in the job and --confirm true on the CLI.',
  ].join('\n');
}

export async function runWorker({
  argv = process.argv.slice(2),
  cwd = REPO_ROOT,
  stdout = process.stdout,
  stderr = process.stderr,
  runCommand = defaultRunCommand,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n\n${usage()}\n`);
    writeJson(stdout, buildRejectedResult(error));
    return 2;
  }

  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!args.job) {
    const error = new Error('--job is required');
    stderr.write(`${error.message}\n\n${usage()}\n`);
    writeJson(stdout, buildRejectedResult(error));
    return 2;
  }

  const repoRoot = path.resolve(args.cwd || cwd);

  try {
    const { job, jobPath, jobDir } = readJobFile(args.job, repoRoot);
    const config = loadLocalConfig(repoRoot);
    const normalized = normalizeJob(job, {
      config,
      jobDir,
      repoRoot,
      confirm: args.confirm,
    });
    const opencli = resolveOpenCliCommand(repoRoot, { runCommand });
    if (!opencli.ok) {
      throw new Error(`OpenCLI command not available.\n${opencli.recovery}`);
    }
    const opencliArgs = buildOpenCliArgs(normalized);
    const opencliResult = runCommand(opencli.command, opencliArgs, { cwd: repoRoot });
    const result = buildWorkerResult({
      job: normalized,
      opencliResult,
      jobPath,
    });
    writeJson(stdout, result);
    return result.ok ? 0 : 1;
  } catch (error) {
    writeJson(stdout, buildRejectedResult(error));
    return 1;
  }
}

export function readJobFile(jobPath, repoRoot = REPO_ROOT) {
  const absolutePath = path.isAbsolute(jobPath) ? jobPath : path.resolve(repoRoot, jobPath);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  return {
    job: parsed,
    jobPath: absolutePath,
    jobDir: path.dirname(absolutePath),
  };
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

export function writeJson(stdout, value) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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
  const status = await runWorker();
  process.exitCode = status;
}
