import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOpenCliArgs, normalizeJob } from '../src/job.js';
import { loadLocalConfig } from '../src/local-config.js';
import { runWorker } from '../worker/posting-worker.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-worker-'));
  writeLocalConfig(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('local posting worker', () => {
  it('runs a dry-run job through the OpenCLI plugin without passing confirm', async () => {
    const imagePath = writeFile('jobs/dry-image.jpg', 'image');
    const jobPath = writeJob('jobs/dry-run.json', {
      groupAlias: 'main',
      caption: 'Dry-run caption',
      images: ['./dry-image.jpg'],
    });
    const output = createOutput();
    const runCommand = createOpenCliRunCommand([
      {
        status: 'dry-run-ready',
        mode: 'dry-run',
        group_url: 'https://www.facebook.com/groups/12345',
        message: 'Composer is prepared.',
        caption_length: 15,
        image_count: 1,
        screenshot: './artifacts/dry-run.png',
      },
    ]);

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    const [, args] = findGroupPostCall(runCommand);
    expect(args).toEqual([
      'facebook',
      'group-post',
      '--group-url',
      'https://www.facebook.com/groups/12345',
      '--caption',
      'Dry-run caption',
      '--images',
      imagePath,
      '--screenshot-dir',
      path.join(tmpDir, 'artifacts', 'facebook-group-post'),
      '--dry-run',
      'true',
    ]);
    expect(args).not.toContain('--confirm');
    expect(JSON.parse(output.text())).toMatchObject({
      ok: true,
      status: 'dry-run-ready',
      mode: 'dry-run',
      image_count: 1,
    });
  });

  it('falls back to the repo-local OpenCLI binary when opencli is not on PATH', async () => {
    const localCommand = writeLocalOpenCliBin(tmpDir);
    const jobPath = writeJob('jobs/local-opencli.json', {
      groupAlias: 'main',
      caption: 'Local OpenCLI fallback',
    });
    const output = createOutput();
    const runCommand = createOpenCliRunCommand([
      {
        status: 'dry-run-ready',
        mode: 'dry-run',
        group_url: 'https://www.facebook.com/groups/12345',
        message: 'Composer is prepared.',
        caption_length: 22,
        image_count: 0,
        screenshot: './artifacts/dry-run.png',
      },
    ], {
      globalAvailable: false,
      localCommand,
    });

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    expect(runCommand).toHaveBeenCalledWith('opencli', ['--version'], { cwd: tmpDir });
    expect(runCommand).toHaveBeenCalledWith(localCommand, ['--version'], { cwd: tmpDir });
    const [command, args] = findGroupPostCall(runCommand);
    expect(command).toBe(localCommand);
    expect(args).toContain('--dry-run');
  });

  it('parses OpenCLI JSON when a version update notice is appended', async () => {
    const jobPath = writeJob('jobs/update-notice.json', {
      groupAlias: 'main',
      caption: 'Update notice suffix',
    });
    const output = createOutput();
    const runCommand = createOpenCliRunCommand([
      {
        status: 'dry-run-ready',
        mode: 'dry-run',
        group_url: 'https://www.facebook.com/groups/12345',
        message: 'Composer is prepared.',
        caption_length: 20,
        image_count: 0,
        screenshot: './artifacts/dry-run.png',
      },
    ], {
      outputSuffix: '\n\n  Update available: v1.8.3 -> v1.8.4\n  Run: npm install -g @jackwener/opencli\n',
    });

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    expect(JSON.parse(output.text())).toMatchObject({
      ok: true,
      status: 'dry-run-ready',
      mode: 'dry-run',
      message: 'Composer is prepared.',
      screenshot: './artifacts/dry-run.png',
    });
  });

  it('rejects with recovery steps when no OpenCLI command can be resolved', async () => {
    const jobPath = writeJob('jobs/missing-opencli.json', {
      groupAlias: 'main',
      caption: 'Missing OpenCLI recovery',
    });
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      if (command === 'opencli' && args.join(' ') === '--version') {
        return { status: 1, output: 'opencli: command not found' };
      }
      return { status: 1, output: `unexpected ${command} ${args.join(' ')}` };
    });

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    const result = JSON.parse(output.text());
    expect(status).toBe(1);
    expect(result).toMatchObject({
      ok: false,
      status: 'rejected',
    });
    expect(result.message).toContain('OpenCLI command not available');
    expect(result.message).toContain('Run: npm install');
    expect(result.message).toContain('npx opencli');
    expect(result.message).toContain('node_modules/.bin/opencli');
    expect(findGroupPostCallOrNull(runCommand)).toBeNull();
  });

  it('defaults worker jobs to dry-run mode', () => {
    const normalized = normalizeJob(
      {
        groupUrl: 'https://www.facebook.com/groups/12345',
        caption: 'Default dry-run',
      },
      {
        config: loadLocalConfig(tmpDir),
        jobDir: tmpDir,
        repoRoot: tmpDir,
      },
    );

    expect(normalized.mode).toBe('dry-run');
    expect(buildOpenCliArgs(normalized)).toContain('--dry-run');
    expect(buildOpenCliArgs(normalized)).not.toContain('--confirm');
  });

  it('runs a live job only with explicit CLI confirmation and passes confirm exactly once', async () => {
    const imagePath = writeFile('jobs/live-image.jpg', 'image');
    const captionFile = writeFile('jobs/caption.txt', 'Live caption');
    const jobPath = writeJob('jobs/live.json', {
      mode: 'live',
      groupAlias: 'main',
      captionFile: './caption.txt',
      images: ['./live-image.jpg'],
    });
    const output = createOutput();
    const runCommand = createOpenCliRunCommand([
      {
        status: 'posted',
        mode: 'live',
        group_url: 'https://www.facebook.com/groups/12345',
        message: 'Composer closed after clicking Post.',
        caption_length: 12,
        image_count: 1,
        screenshot: './artifacts/post.png',
      },
    ]);

    const status = await runWorker({
      argv: ['--job', jobPath, '--confirm', 'true'],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    const [, args] = findGroupPostCall(runCommand);
    expect(args).toContain('--caption-file');
    expect(args).toContain(captionFile);
    expect(args).toContain(imagePath);
    expect(args.filter((arg) => arg === '--confirm')).toHaveLength(1);
    expect(args).not.toContain('--dry-run');
    expect(JSON.parse(output.text())).toMatchObject({
      ok: true,
      status: 'posted',
      mode: 'live',
    });
  });

  it('rejects live jobs without explicit CLI confirmation before calling OpenCLI', async () => {
    const jobPath = writeJob('jobs/live-unconfirmed.json', {
      mode: 'live',
      groupAlias: 'main',
      caption: 'Live caption',
    });
    const output = createOutput();
    const runCommand = vi.fn();

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(1);
    expect(runCommand).not.toHaveBeenCalled();
    expect(JSON.parse(output.text())).toMatchObject({
      ok: false,
      status: 'rejected',
      message: expect.stringContaining('--confirm true'),
    });
  });

  it('rejects confirm on a dry-run job before calling OpenCLI', async () => {
    const jobPath = writeJob('jobs/dry-confirmed.json', {
      mode: 'dry-run',
      groupAlias: 'main',
      caption: 'Dry-run caption',
    });
    const output = createOutput();
    const runCommand = vi.fn();

    const status = await runWorker({
      argv: ['--job', jobPath, '--confirm', 'true'],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(1);
    expect(runCommand).not.toHaveBeenCalled();
    expect(JSON.parse(output.text()).message).toContain('only valid when job mode is "live"');
  });

  it('rejects unknown group aliases', async () => {
    const jobPath = writeJob('jobs/unknown-group.json', {
      groupAlias: 'missing',
      caption: 'Hello',
    });
    const output = createOutput();
    const runCommand = vi.fn();

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(1);
    expect(runCommand).not.toHaveBeenCalled();
    expect(JSON.parse(output.text()).message).toContain('Unknown group alias "missing"');
  });

  it('accepts a full group URL without a group alias', async () => {
    const jobPath = writeJob('jobs/full-url.json', {
      groupUrl: 'https://www.facebook.com/groups/67890',
      caption: 'Full URL caption',
    });
    const output = createOutput();
    const runCommand = createOpenCliRunCommand([
      { status: 'dry-run-ready', group_url: 'https://www.facebook.com/groups/67890' },
    ]);

    const status = await runWorker({
      argv: ['--job', jobPath],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    expect(findGroupPostCall(runCommand)[1]).toContain('https://www.facebook.com/groups/67890');
  });

  it('rejects missing images, remote image URLs, empty captions, and conflicting captions', async () => {
    await expectRejectedJob(
      {
        groupAlias: 'main',
        caption: 'Image missing',
        images: ['./missing.jpg'],
      },
      /does not exist/,
    );

    await expectRejectedJob(
      {
        groupAlias: 'main',
        caption: 'Remote image',
        images: ['https://example.com/image.jpg'],
      },
      /local image paths/,
    );

    await expectRejectedJob(
      {
        groupAlias: 'main',
        caption: '   ',
      },
      /Caption must not be empty/,
    );

    const captionFile = writeFile('jobs/conflict.txt', 'caption file');
    await expectRejectedJob(
      {
        groupAlias: 'main',
        caption: 'caption',
        captionFile,
      },
      /not both/,
    );
  });

  it('exposes worker package scripts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(packageJson.scripts).toMatchObject({
      'worker:dry-run': 'node worker/posting-worker.js --job examples/job.dry-run.json',
      'worker:confirm': 'node worker/posting-worker.js --job examples/job.live.json --confirm true',
    });
  });
});

async function expectRejectedJob(job, messagePattern) {
  const jobPath = writeJob(`jobs/rejected-${Math.random()}.json`, job);
  const output = createOutput();
  const runCommand = vi.fn();

  const status = await runWorker({
    argv: ['--job', jobPath],
    cwd: tmpDir,
    stdout: output,
    stderr: output,
    runCommand,
  });

  expect(status).toBe(1);
  expect(runCommand).not.toHaveBeenCalled();
  expect(JSON.parse(output.text()).message).toMatch(messagePattern);
}

function writeLocalConfig(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'config', 'settings.json'),
    JSON.stringify({
      artifactsDir: './artifacts/facebook-group-post',
      safety: {
        storesCredentials: false,
      },
    }),
  );
  fs.writeFileSync(
    path.join(repoRoot, 'config', 'groups.json'),
    JSON.stringify({
      groups: [
        {
          alias: 'main',
          label: 'Main approved group',
          url: 'https://www.facebook.com/groups/12345',
          approvedForPosting: true,
        },
      ],
    }),
  );
}

function writeJob(relativePath, job) {
  return writeFile(relativePath, `${JSON.stringify(job, null, 2)}\n`);
}

function writeFile(relativePath, contents) {
  const filePath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function createOutput() {
  let buffer = '';
  return {
    write(chunk) {
      buffer += chunk;
    },
    text() {
      return buffer;
    },
  };
}

function createOpenCliRunCommand(rows, { globalAvailable = true, localCommand = null, outputSuffix = '' } = {}) {
  return vi.fn((command, args) => {
    if (command === 'opencli' && args.join(' ') === '--version') {
      return globalAvailable
        ? { status: 0, output: 'opencli 1.0.0' }
        : { status: 1, output: 'opencli: command not found' };
    }
    if (localCommand && command === localCommand && args.join(' ') === '--version') {
      return { status: 0, output: 'opencli 1.0.0' };
    }
    if (args.join(' ') === 'profile list') return { status: 0, output: JSON.stringify({ ok: true, data: { profiles: [{ contextId: 'default', connected: true }] } }) };
    if (args[0] === 'facebook' && args[1] === 'group-post') {
      return { status: 0, output: `${JSON.stringify(rows)}${outputSuffix}` };
    }
    return { status: 1, output: `unexpected ${command} ${args.join(' ')}` };
  });
}

function findGroupPostCall(runCommand) {
  const call = runCommand.mock.calls.find(([, args]) => args[0] === 'facebook' && args[1] === 'group-post');
  expect(call).toBeTruthy();
  return call;
}

function findGroupPostCallOrNull(runCommand) {
  return runCommand.mock.calls.find(([, args]) => args[0] === 'facebook' && args[1] === 'group-post') || null;
}

function writeLocalOpenCliBin(repoRoot) {
  const opencli = path.join(repoRoot, 'node_modules', '.bin', 'opencli');
  fs.mkdirSync(path.dirname(opencli), { recursive: true });
  fs.writeFileSync(opencli, '#!/usr/bin/env node\n');
  return opencli;
}
