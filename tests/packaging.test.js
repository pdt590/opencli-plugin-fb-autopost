import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  packageEntries,
  packageLocal,
  parseArgs,
  runPackageLocal,
} from '../scripts/package-local.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-package-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('packaging, pilot, and release docs', () => {
  it('keeps README as a short landing guide with local-first daily flow', () => {
    const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
    expect(readme).toContain('Local-first Facebook group posting');
    expect(readme).toContain('docs/hermes-telegram.md');
    expect(readme).toContain('docs/first-run-checklist.md');
    expect(readme).toContain('docs/pilot-checklist.md');
    expect(readme).toContain('docs/release-checklist.md');
    expect(readme).toContain('No cloud browser automation');
    expect(readme).toContain('No unattended live posting');
    expect(readme).toContain('No scheduler or queue');
    expect(readme).toContain('No Facebook password, cookie, token, session, or credential collection');
    expect(readme).toContain('Reply POST to publish or CANCEL to discard');
    expect(readme).toContain('npm run package');
    expect(readme).toContain('npm run package:local');
    expect(readme).toContain('node scripts/package-local.js --dry-run');
  });

  it('provides a single first-run checklist with install, setup, Hermes, and dry-run steps', () => {
    const checklist = fs.readFileSync(path.resolve('docs/first-run-checklist.md'), 'utf8');
    for (const text of [
      'Install Node 20 or newer',
      'Install OpenCLI',
      'Install Hermes Agent',
      'git clone https://github.com/thenotoriousmrkrabs/opencli-plugin-fb-autopost.git',
      'npm install',
      'npm run setup',
      'opencli plugin install',
      'Open Brave or Chrome',
      'Log into Facebook manually',
      'opencli facebook groups',
      'node scripts/install-hermes-skill.js --force',
      'hermes whatsapp',
      'hermes gateway start',
      '--dry-run true',
      'docs/pilot-checklist.md',
      'docs/release-checklist.md',
      'No cloud browser automation',
      'No scheduler',
      'No queue',
      'No Facebook credentials',
    ]) {
      expect(checklist).toContain(text);
    }
  });

  it('documents the Phase 6 pilot flow with automated and manual acceptance gates', () => {
    const checklist = fs.readFileSync(path.resolve('docs/pilot-checklist.md'), 'utf8');
    for (const text of [
      'Clean-Machine Install Test',
      'OpenCLI PATH Verification',
      'Browser Bridge Readiness',
      'OpenCLI Plugin Dry-Run Acceptance',
      'Optional Supervised Live Test',
      'Worker Acceptance',
      'Hermes Messaging Pilot',
      'Automated Vs Manual',
      'Facebook login in the connected Brave/Chrome profile',
      'Browser Bridge extension setup and connection',
      'opencli facebook groups',
      'Visual dry-run confirmation',
      'Any live `--confirm true` post',
      'Telegram bot setup or WhatsApp QR pairing',
      'Messaging image attachment pilot',
      'CAPTCHA, checkpoint, 2FA, login wall, or action-blocked resolution',
      'No scheduler',
      'No queue',
      'No multi-group posting',
      'No analytics',
      'No cloud browser automation',
      'No Facebook password, cookie, token, session, or credential is stored',
      'No retry happens around the `Post` click',
    ]) {
      expect(checklist).toContain(text);
    }
  });

  it('documents v0.1.0 release hardening, packaging, and tagging', () => {
    const checklist = fs.readFileSync(path.resolve('docs/release-checklist.md'), 'utf8');
    for (const text of [
      'v0.1.0',
      'Automated Release Checks',
      'Manual Release Checks',
      'Documentation Cleanup',
      'npm install',
      'npm test',
      'npm run setup -- --group-url "<TEST_GROUP_URL>" --group-alias main',
      'node scripts/install-hermes-skill.js --dry-run',
      'docs/pilot-checklist.md',
      'docs/first-run-checklist.md',
      'docs/release-checklist.md',
      'docs/troubleshooting.md',
      'docs/release-notes.md',
      'git diff --check',
      'git status --short',
      'git tag -a v0.1.0 -m "v0.1.0 initial public release"',
      'npm run doctor',
      'npx opencli doctor',
      'npx opencli facebook groups',
      'npx opencli facebook group-post',
      'node worker/posting-worker.js --job',
      'Hermes Telegram or WhatsApp dry-run',
      'node scripts/package-local.js --dry-run',
      'npm run package',
      'No scheduler',
      'No queue',
      'No multi-group posting',
      'No analytics',
      'No cloud browser automation',
      'No credential storage',
      'No retry around the `Post` click',
    ]) {
      expect(checklist).toContain(text);
    }
  });

  it('provides v0.1.0 release notes with pilot evidence and safety scope', () => {
    const notes = fs.readFileSync(path.resolve('docs/release-notes.md'), 'utf8');
    for (const text of [
      'v0.1.0',
      'initial public release',
      'npm test',
      'npm run doctor',
      'npx opencli doctor',
      'npx opencli facebook groups',
      'Plugin dry-run',
      'Worker dry-run',
      'Hermes Telegram or WhatsApp dry-run',
      'explicit human approval',
      'npm run package',
      'node scripts/package-local.js --dry-run',
      'git tag -a v0.1.0 -m "v0.1.0 initial public release"',
      'No scheduler',
      'No queue',
      'No multi-group posting',
      'No cloud browser automation',
      'No Facebook credential storage',
      'No CAPTCHA, checkpoint, 2FA, login, or action-blocked bypass',
      'No retry around the Facebook `Post` click',
    ]) {
      expect(notes).toContain(text);
    }
  });

  it('documents daily operator use and explicit POST/CANCEL behavior', () => {
    const guide = fs.readFileSync(path.resolve('docs/operator-guide.md'), 'utf8');
    expect(guide).toContain('Send a Telegram or WhatsApp message');
    expect(guide).toContain('Hermes prepares a draft only');
    expect(guide).toContain('Reply:');
    expect(guide).toContain('`POST` to publish');
    expect(guide).toContain('`CANCEL` to discard');
    expect(guide).toContain('Hermes publishes only after `POST`');
  });

  it('covers required troubleshooting cases', () => {
    const troubleshooting = fs.readFileSync(path.resolve('docs/troubleshooting.md'), 'utf8');
    for (const heading of [
      'OpenCLI command not found',
      'Browser Bridge disconnected',
      'OpenCLI daemon failed to start',
      'Facebook logged out',
      'Browser profile mismatch',
      'Facebook draft says “Leave site?”',
      'Images are not visible',
      'Pending approval',
      'Checkpoint, CAPTCHA, or action blocked',
      'Hermes gateway stopped',
      'Invalid group alias',
    ]) {
      expect(troubleshooting).toContain(heading);
    }
    expect(troubleshooting).toContain('Do not paste Facebook passwords');
    expect(troubleshooting).toContain('Do not attempt bypasses');
    expect(troubleshooting).toContain('npm install');
    expect(troubleshooting).toContain('npx opencli');
    expect(troubleshooting).toContain('node_modules/.bin/opencli');
    expect(troubleshooting).toContain('npm install -g @jackwener/opencli');
  });

  it('does not need an env example because config files contain only non-secret local settings', () => {
    expect(fs.existsSync(path.resolve('.env.example'))).toBe(false);
    const settings = fs.readFileSync(path.resolve('config/settings.json.example'), 'utf8').toLowerCase();
    expect(settings).not.toMatch(/password|cookie|token|secret|session/);
  });
});

describe('package-local script', () => {
  it('parses package options', () => {
    expect(parseArgs(['--dry-run', '--out-dir', 'release'])).toMatchObject({
      dryRun: true,
      outDir: 'release',
    });
  });

  it('includes the local-first repo files needed for handoff', () => {
    expect(packageEntries()).toEqual(expect.arrayContaining([
      'README.md',
      'package.json',
      'package-lock.json',
      'opencli-plugin.json',
      'group-post.js',
      'src',
      'worker',
      'scripts',
      'docs',
      'config',
      'examples',
      'hermes',
      'artifacts/.gitkeep',
      'install.sh',
      'LICENSE',
      'NOTICE.md',
      'THIRD_PARTY_NOTICES.md',
      'SECURITY.md',
    ]));
  });

  it('dry-run reports the archive without creating it', () => {
    const result = packageLocal({
      repoRoot: path.resolve('.'),
      outDir: path.relative(path.resolve('.'), tmpDir),
      dryRun: true,
    });

    expect(result.archivePath).toBe(path.join(tmpDir, 'opencli-plugin-fb-autopost-local.tar.gz'));
    expect(fs.existsSync(result.archivePath)).toBe(false);
  });

  it('calls tar with expected entries when packaging', () => {
    const runCommand = vi.fn(() => ({ status: 0, output: '' }));
    const result = packageLocal({
      repoRoot: path.resolve('.'),
      outDir: path.relative(path.resolve('.'), tmpDir),
      dryRun: false,
    }, runCommand);

    expect(runCommand).toHaveBeenCalledWith(
      'tar',
      ['-czf', result.archivePath, ...packageEntries()],
      { cwd: path.resolve('.') },
    );
  });

  it('exposes npm package script and dry-run command', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(packageJson.scripts.package).toBe('node scripts/package-local.js');
    expect(packageJson.scripts['package:local']).toBe('node scripts/package-local.js');

    const output = createOutput();
    const status = await runPackageLocal({
      argv: ['--dry-run'],
      stdout: output,
      stderr: output,
      runCommand: vi.fn(),
    });

    expect(status).toBe(0);
    expect(output.text()).toContain('Would create local package');
    expect(output.text()).toContain('docs/first-run-checklist.md');
  });
});

describe('install.sh', () => {
  it('is macOS-first and does not collect Facebook credentials', () => {
    const installScript = fs.readFileSync(path.resolve('install.sh'), 'utf8');
    expect(installScript).toContain('macOS-first local installer');
    expect(installScript).toContain('npm install');
    expect(installScript).toContain('npm run setup');
    expect(installScript).toContain('node scripts/install-hermes-skill.js --force');
    expect(installScript).toContain('npm run doctor');
    expect(installScript).toContain('hermes gateway setup');
    expect(installScript).toContain('numeric user ID');
    expect(installScript).toContain('hermes gateway start');
    expect(installScript).toContain('does not post to Facebook');
    expect(installScript).toContain('ask for passwords');
  });
});

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
