import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SETTINGS } from './local-config.js';
import { extractLeadingJson } from './job.js';

export class WorkerClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkerClientError';
  }
}

export function buildDryRunJob(draft, { screenshotDir = DEFAULT_SETTINGS.artifactsDir } = {}) {
  if (!draft?.draftId) throw new WorkerClientError('Draft is required');
  if (!draft.groupAlias && !draft.groupUrl) throw new WorkerClientError('Draft must have a group before dry-run');
  if (!draft.caption || !draft.caption.trim()) throw new WorkerClientError('Draft must have a caption before dry-run');

  const job = {
    mode: 'dry-run',
    caption: draft.caption,
    images: draft.localImagePaths || [],
    screenshotDir,
  };
  if (draft.groupAlias) job.groupAlias = draft.groupAlias;
  else job.groupUrl = draft.groupUrl;
  return job;
}

export function buildLiveJob(draft, { screenshotDir = DEFAULT_SETTINGS.artifactsDir } = {}) {
  const job = buildDryRunJob(draft, { screenshotDir });
  return {
    ...job,
    mode: 'live',
  };
}

export function dryRunJobPath(draft, { repoRoot = process.cwd() } = {}) {
  if (!draft?.draftId) throw new WorkerClientError('Draft is required');
  return path.join(repoRoot, 'artifacts', 'whatsapp-business', 'jobs', `${draft.draftId}.dry-run.json`);
}

export function liveJobPath(draft, { repoRoot = process.cwd() } = {}) {
  if (!draft?.draftId) throw new WorkerClientError('Draft is required');
  return path.join(repoRoot, 'artifacts', 'whatsapp-business', 'jobs', `${draft.draftId}.live.json`);
}

export function writeDryRunJob(draft, { repoRoot = process.cwd(), screenshotDir = DEFAULT_SETTINGS.artifactsDir } = {}) {
  const absolutePath = dryRunJobPath(draft, { repoRoot });
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const job = buildDryRunJob(draft, { screenshotDir });
  fs.writeFileSync(absolutePath, `${JSON.stringify(job, null, 2)}\n`);
  return {
    job,
    jobPath: absolutePath,
    relativeJobPath: path.relative(repoRoot, absolutePath),
  };
}

export function writeLiveJob(draft, { repoRoot = process.cwd(), screenshotDir = DEFAULT_SETTINGS.artifactsDir } = {}) {
  const absolutePath = liveJobPath(draft, { repoRoot });
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const job = buildLiveJob(draft, { screenshotDir });
  fs.writeFileSync(absolutePath, `${JSON.stringify(job, null, 2)}\n`);
  return {
    job,
    jobPath: absolutePath,
    relativeJobPath: path.relative(repoRoot, absolutePath),
  };
}

export function runDryRunWorker(
  draft,
  {
    repoRoot = process.cwd(),
    screenshotDir = DEFAULT_SETTINGS.artifactsDir,
    runCommand = defaultRunCommand,
  } = {},
) {
  const { job, jobPath, relativeJobPath } = writeDryRunJob(draft, {
    repoRoot,
    screenshotDir,
  });
  const args = ['worker/posting-worker.js', '--job', relativeJobPath];
  const commandResult = runCommand('node', args, { cwd: repoRoot });
  const workerResult = parseWorkerResult(commandResult.output);

  return {
    job,
    jobPath,
    relativeJobPath,
    command: 'node',
    args,
    exitCode: commandResult.status,
    workerResult,
    output: commandResult.output,
  };
}

export function runLiveWorker(
  draft,
  {
    repoRoot = process.cwd(),
    screenshotDir = DEFAULT_SETTINGS.artifactsDir,
    runCommand = defaultRunCommand,
  } = {},
) {
  const { job, jobPath, relativeJobPath } = writeLiveJob(draft, {
    repoRoot,
    screenshotDir,
  });
  const args = ['worker/posting-worker.js', '--job', relativeJobPath, '--confirm', 'true'];
  const commandResult = runCommand('node', args, { cwd: repoRoot });
  const workerResult = parseWorkerResult(commandResult.output);

  return {
    job,
    jobPath,
    relativeJobPath,
    command: 'node',
    args,
    exitCode: commandResult.status,
    workerResult,
    output: commandResult.output,
  };
}

export function parseWorkerResult(output = '') {
  const jsonText = extractLeadingJson(String(output || ''));
  if (!jsonText) {
    return {
      ok: false,
      status: 'failed',
      message: String(output || '').trim() || 'Worker did not return JSON output',
    };
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  return {
    ok: false,
    status: 'failed',
    message: 'Worker returned malformed JSON output',
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
