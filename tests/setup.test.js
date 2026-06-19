import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDoctor } from '../scripts/doctor.js';
import { runSetup } from '../scripts/setup.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-setup-'));
  fs.mkdirSync(path.join(tmpDir, 'node_modules', '@jackwener', 'opencli'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'node_modules', 'vitest'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('setup wizard', () => {
  it('creates local settings, approved group config, artifacts, and installs only the local plugin', async () => {
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      if (command === 'opencli' && args.join(' ') === '--version') return { status: 0, output: 'opencli 1.0.0' };
      if (command === 'opencli' && args.slice(0, 2).join(' ') === 'plugin install') {
        return { status: 0, output: 'installed fb-autopost' };
      }
      return { status: 1, output: 'unexpected command' };
    });

    const status = await runSetup({
      argv: [
        '--group-url',
        'https://www.facebook.com/groups/12345',
        '--group-alias',
        'main',
        '--group-label',
        'Main approved group',
      ],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
      isTTY: false,
    });

    expect(status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'config', 'settings.json'), 'utf8'))).toMatchObject({
      artifactsDir: './artifacts/facebook-group-post',
      safety: {
        dryRunDefault: true,
        liveRequiresConfirmTrue: true,
        storesCredentials: false,
        facebookLoginIsManual: true,
      },
    });
    expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'config', 'groups.json'), 'utf8'))).toMatchObject({
      groups: [
        {
          alias: 'main',
          label: 'Main approved group',
          url: 'https://www.facebook.com/groups/12345',
          approvedForPosting: true,
        },
      ],
    });
    expect(fs.statSync(path.join(tmpDir, 'artifacts', 'facebook-group-post')).isDirectory()).toBe(true);
    expect(runCommand).toHaveBeenCalledWith('opencli', ['--version'], { cwd: tmpDir });
    expect(runCommand).toHaveBeenCalledWith('opencli', ['plugin', 'install', `file://${tmpDir}`], { cwd: tmpDir });
    expect(runCommand.mock.calls.some(([, args]) => args.includes('group-post'))).toBe(false);
    expect(output.text()).toContain('never posts to Facebook');
    expect(output.text()).toContain('Log into Facebook manually');
  });

  it('installs with the repo-local OpenCLI binary when opencli is not on PATH', async () => {
    const localCommand = writeLocalOpenCliBin(tmpDir);
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      if (command === 'opencli' && args.join(' ') === '--version') return { status: 1, output: 'opencli: command not found' };
      if (command === localCommand && args.join(' ') === '--version') return { status: 0, output: 'opencli 1.0.0' };
      if (command === localCommand && args.slice(0, 2).join(' ') === 'plugin install') {
        return { status: 0, output: 'installed fb-autopost' };
      }
      return { status: 1, output: 'unexpected command' };
    });

    const status = await runSetup({
      argv: ['--group-url', 'https://www.facebook.com/groups/12345'],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
      isTTY: false,
    });

    expect(status).toBe(0);
    expect(output.text()).toContain('OpenCLI command available from repo-local install');
    expect(runCommand).toHaveBeenCalledWith('opencli', ['--version'], { cwd: tmpDir });
    expect(runCommand).toHaveBeenCalledWith(localCommand, ['--version'], { cwd: tmpDir });
    expect(runCommand).toHaveBeenCalledWith(localCommand, ['plugin', 'install', `file://${tmpDir}`], { cwd: tmpDir });
  });

  it('treats an already-installed local OpenCLI plugin as ready', async () => {
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      if (command === 'opencli' && args.join(' ') === '--version') return { status: 0, output: 'opencli 1.0.0' };
      if (command === 'opencli' && args.slice(0, 2).join(' ') === 'plugin install') {
        return {
          status: 1,
          output: `Error: Plugin "fb-autopost" is already installed at ${path.join(tmpDir, '.opencli', 'plugins', 'fb-autopost')}`,
        };
      }
      return { status: 1, output: 'unexpected command' };
    });

    const status = await runSetup({
      argv: ['--group-url', 'https://www.facebook.com/groups/12345'],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
      isTTY: false,
    });

    expect(status).toBe(0);
    expect(output.text()).toContain('[ok] Local OpenCLI plugin already installed');
    expect(output.text()).not.toContain('[missing] Local OpenCLI plugin installed');
  });

  it('dry-run prints actions without writing local config or installing the plugin', async () => {
    const output = createOutput();
    const runCommand = vi.fn(() => ({ status: 0, output: 'ok' }));

    const status = await runSetup({
      argv: ['--dry-run', '--group-url', 'https://www.facebook.com/groups/12345'],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
      isTTY: false,
    });

    expect(status).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'config', 'settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'config', 'groups.json'))).toBe(false);
    expect(runCommand).toHaveBeenCalledWith('opencli', ['--version'], { cwd: tmpDir });
    expect(runCommand.mock.calls.some(([, args]) => args.slice(0, 2).join(' ') === 'plugin install')).toBe(false);
    expect(output.text()).toContain('Would install local OpenCLI plugin');
  });

  it('requires an approved group URL in non-interactive mode', async () => {
    const output = createOutput();
    const status = await runSetup({
      argv: ['--yes'],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand: () => ({ status: 0, output: 'ok' }),
      isTTY: false,
    });

    expect(status).toBe(1);
    expect(output.text()).toContain('Approved group URL saved locally');
    expect(output.text()).toContain('npm run setup -- --group-url');
  });
});

describe('doctor', () => {
  it('reports exact next manual steps when Browser Bridge or Facebook login are not ready', async () => {
    writeValidLocalConfig(tmpDir);
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      const key = `${command} ${args.join(' ')}`;
      if (key === 'opencli --version') return { status: 0, output: 'opencli 1.0.0' };
      if (key === 'opencli plugin list') return { status: 0, output: 'fb-autopost' };
      if (key === 'opencli doctor') return { status: 1, output: 'Browser Bridge is not connected' };
      if (key === 'opencli facebook groups') return { status: 1, output: 'Log in to Facebook' };
      return { status: 1, output: `unexpected ${key}` };
    });

    const status = await runDoctor({
      argv: [],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(1);
    expect(output.text()).toContain('[missing] Browser Bridge available. Next: Open Brave or Chrome');
    expect(output.text()).toContain('[missing] Facebook session readable. Next: Log into Facebook manually');
    expect(runCommand.mock.calls.some(([, args]) => args.includes('group-post'))).toBe(false);
  });

  it('points daemon startup failures at daemon recovery before Facebook login recovery', async () => {
    writeValidLocalConfig(tmpDir);
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      const key = `${command} ${args.join(' ')}`;
      if (key === 'opencli --version') return { status: 0, output: 'opencli 1.0.0' };
      if (key === 'opencli plugin list') return { status: 0, output: 'fb-autopost' };
      if (key === 'opencli doctor') return { status: 0, output: 'ok' };
      if (key === 'opencli facebook groups') {
        return {
          status: 1,
          output: 'code: BROWSER_CONNECT\nmessage: Failed to start opencli daemon\nMake sure port 19825 is available.',
        };
      }
      return { status: 1, output: `unexpected ${key}` };
    });

    const status = await runDoctor({
      argv: [],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(1);
    expect(output.text()).toContain('Start the OpenCLI daemon manually or free port 19825');
    expect(output.text()).toContain('opencli facebook groups');
  });

  it('passes when local config, plugin, Browser Bridge, and Facebook session checks pass', async () => {
    writeValidLocalConfig(tmpDir);
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      const key = `${command} ${args.join(' ')}`;
      if (key === 'opencli --version') return { status: 0, output: 'opencli 1.0.0' };
      if (key === 'opencli plugin list') return { status: 0, output: 'fb-autopost' };
      if (key === 'opencli doctor') return { status: 0, output: 'ok' };
      if (key === 'opencli facebook groups') return { status: 0, output: 'Test Group' };
      return { status: 1, output: `unexpected ${key}` };
    });

    const status = await runDoctor({
      argv: [],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    expect(output.text()).toContain('[ok] local config readable');
    expect(output.text()).toContain('[ok] Facebook session readable');
  });

  it('uses repo-local OpenCLI for plugin, Browser Bridge, and Facebook checks when PATH is missing', async () => {
    writeValidLocalConfig(tmpDir);
    const localCommand = writeLocalOpenCliBin(tmpDir);
    const output = createOutput();
    const runCommand = vi.fn((command, args) => {
      const key = `${command} ${args.join(' ')}`;
      if (key === 'opencli --version') return { status: 1, output: 'opencli: command not found' };
      if (key === `${localCommand} --version`) return { status: 0, output: 'opencli 1.0.0' };
      if (key === `${localCommand} plugin list`) return { status: 0, output: 'fb-autopost' };
      if (key === `${localCommand} doctor`) return { status: 0, output: 'ok' };
      if (key === `${localCommand} facebook groups`) return { status: 0, output: 'Test Group' };
      return { status: 1, output: `unexpected ${key}` };
    });

    const status = await runDoctor({
      argv: [],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand,
    });

    expect(status).toBe(0);
    expect(output.text()).toContain('OpenCLI command available from repo-local install');
    expect(runCommand).toHaveBeenCalledWith(localCommand, ['plugin', 'list'], { cwd: tmpDir });
    expect(runCommand).toHaveBeenCalledWith(localCommand, ['doctor'], { cwd: tmpDir });
    expect(runCommand).toHaveBeenCalledWith(localCommand, ['facebook', 'groups'], { cwd: tmpDir });
  });

  it('reports missing config with the setup command', async () => {
    const output = createOutput();
    const status = await runDoctor({
      argv: [],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand: () => ({ status: 1, output: 'not installed' }),
    });

    expect(status).toBe(1);
    expect(output.text()).toContain('[missing] local config readable');
    expect(output.text()).toContain('npm run setup -- --group-url');
  });

  it('reports OpenCLI recovery steps when neither global nor repo-local command is available', async () => {
    writeValidLocalConfig(tmpDir);
    const output = createOutput();
    const status = await runDoctor({
      argv: [],
      cwd: tmpDir,
      stdout: output,
      stderr: output,
      runCommand: () => ({ status: 1, output: 'opencli: command not found' }),
    });

    expect(status).toBe(1);
    expect(output.text()).toContain('[missing] OpenCLI command not available');
    expect(output.text()).toContain('Run: npm install');
    expect(output.text()).toContain('npx opencli');
    expect(output.text()).toContain('node_modules/.bin/opencli');
    expect(output.text()).toContain('npm install -g @jackwener/opencli');
  });
});

describe('phase 2 repo wiring', () => {
  it('exposes setup, doctor, and test package scripts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(packageJson.scripts).toMatchObject({
      setup: 'node scripts/setup.js',
      doctor: 'node scripts/doctor.js',
      test: 'vitest run',
    });
  });

  it('keeps example configs free of credential-like fields', () => {
    for (const filePath of [
      path.resolve('config/settings.json.example'),
      path.resolve('config/groups.json.example'),
    ]) {
      const text = fs.readFileSync(filePath, 'utf8').toLowerCase();
      expect(text).not.toMatch(/password|cookie|token|secret|session/);
    }
  });
});

function writeValidLocalConfig(repoRoot) {
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

function writeLocalOpenCliBin(repoRoot) {
  const opencli = path.join(repoRoot, 'node_modules', '.bin', 'opencli');
  fs.mkdirSync(path.dirname(opencli), { recursive: true });
  fs.writeFileSync(opencli, '#!/usr/bin/env node\n');
  return opencli;
}
