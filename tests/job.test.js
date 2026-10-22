import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normalizeJob, buildOpenCliArgs, buildWorkerResult } from '../src/job.js';
import { runWorker } from '../worker/posting-worker.js';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-person-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const base = { target: 'person', caption: 'Personal draft', profile: 'xmqguda9', slow: true, images: [] };
const options = () => ({ jobDir: dir, repoRoot: dir, config: {} });
function output() { let text = ''; return { write: chunk => { text += chunk; }, text: () => text }; }

it('routes personal jobs without group config and preserves profile/slow flags', () => {
  const job = normalizeJob(base, options());
  expect(job).toMatchObject({ target: 'person', mode: 'dry-run', profile: 'xmqguda9', slow: true });
  const args = buildOpenCliArgs(job);
  expect(args.slice(0, 4)).toEqual(['--profile', 'xmqguda9', 'facebook', 'person-post']);
  expect(args).toContain('--slow'); expect(args).not.toContain('--group-url'); expect(args).not.toContain('--confirm');
});
it.each([
  { target: 'page' }, { groupAlias: 'main' }, { groupUrl: 'https://www.facebook.com/groups/1' },
  { profile: '--confirm' }, { profile: 12 }, { slow: 'maybe' }, { profileUrl: 'https://www.facebook.com/other' },
])('rejects invalid or ambiguous personal routing %j', extra => {
  expect(() => normalizeJob({ ...base, ...extra }, options())).toThrow();
});
it('keeps dual confirmation for personal jobs', () => {
  expect(() => normalizeJob({ ...base, mode: 'live' }, options())).toThrow(/confirm/);
  expect(buildOpenCliArgs(normalizeJob({ ...base, mode: 'live' }, { ...options(), confirm: true }))).toContain('--confirm');
});
it('unwraps OpenCLI 2 JSON results and preserves the personal target', () => {
  const job = normalizeJob(base, options());
  const result = buildWorkerResult({ job, opencliResult: { status: 0, output: JSON.stringify({ ok: true, data: [{ status: 'dry-run-ready', profile_url: 'https://www.facebook.com/self/', screenshot: 'proof.png' }] }) } });
  expect(result).toMatchObject({ ok: true, status: 'dry-run-ready', profile_url: 'https://www.facebook.com/self/', screenshot: 'proof.png' });
  expect(result).not.toHaveProperty('group_url');
});
it('does not treat a JSON failure envelope as a successful worker job', () => {
  const job = normalizeJob(base, options());
  expect(buildWorkerResult({ job, opencliResult: { status: 0, output: JSON.stringify({ ok: false, error: { message: 'Checkpoint' } }) } })).toMatchObject({ ok: false, status: 'failed', message: 'Checkpoint' });
});
it('runs a personal job through the actual worker and forwards structured arguments once', async () => {
  const jobPath = path.join(dir, 'job.json'); fs.writeFileSync(jobPath, '\uFEFF' + JSON.stringify(base));
  const stdout = output();
  const runCommand = vi.fn((cmd, args) => ({ status: 0, output: args.includes('--version') ? '2.0.0' : JSON.stringify({ ok: true, data: [{ status: 'dry-run-ready', profile_url: 'https://www.facebook.com/self/' }] }) }));
  expect(await runWorker({ argv: ['--job', jobPath], cwd: dir, stdout, stderr: output(), runCommand })).toBe(0);
  expect(JSON.parse(stdout.text()).status).toBe('dry-run-ready');
  expect(runCommand.mock.calls.filter(([, args]) => args.includes('person-post'))).toHaveLength(1);
});
