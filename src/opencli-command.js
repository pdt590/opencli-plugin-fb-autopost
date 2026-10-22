import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const OPENCLI_RECOVERY_STEPS = [
  'Run: npm install',
  'Then retry with the repo-local command: npx opencli ...',
  'Or run directly: node_modules/.bin/opencli ...',
  'Optional global install: npm install -g @jackwener/opencli',
];

export function resolveOpenCliCommand(
  repoRoot = process.cwd(),
  { runCommand = defaultRunCommand, fsExists = fs.existsSync } = {},
) {
  const cwd = path.resolve(repoRoot);
  const globalCheck = runCommand('opencli', ['--version'], { cwd });
  if (globalCheck.status === 0) {
    return {
      ok: true,
      command: 'opencli',
      source: 'global',
      version: String(globalCheck.output || '').trim(),
      recovery: '',
    };
  }

  const localCommand = localOpenCliPath(cwd);
  if (fsExists(localCommand)) {
    const localCheck = runCommand(localCommand, ['--version'], { cwd });
    if (localCheck.status === 0) {
      return {
        ok: true,
        command: localCommand,
        source: 'local',
        version: String(localCheck.output || '').trim(),
        globalError: String(globalCheck.output || '').trim(),
        recovery: '',
      };
    }

    return {
      ok: false,
      command: null,
      source: 'missing',
      globalError: String(globalCheck.output || '').trim(),
      localError: String(localCheck.output || '').trim(),
      recovery: openCliRecoveryText(),
    };
  }

  return {
    ok: false,
    command: null,
    source: 'missing',
    globalError: String(globalCheck.output || '').trim(),
    localError: `Repo-local OpenCLI was not found at ${localCommand}`,
    recovery: openCliRecoveryText(),
  };
}

export function localOpenCliPath(repoRoot = process.cwd()) {
  return path.join(path.resolve(repoRoot), 'node_modules', '.bin', 'opencli');
}

export function openCliRecoveryText() {
  return OPENCLI_RECOVERY_STEPS.join('\n');
}

export function describeOpenCliResolution(resolution) {
  if (resolution.ok && resolution.source === 'global') {
    return 'OpenCLI command available on PATH';
  }
  if (resolution.ok && resolution.source === 'local') {
    return `OpenCLI command available from repo-local install: ${resolution.command}`;
  }
  return `OpenCLI command not available. Next:\n${resolution.recovery}`;
}

export function defaultRunCommand(command, args, options = {}) {
  // Invoke Node directly on Windows: .cmd shims cannot be spawned without a
  // shell, and captions must remain literal arguments (never shell code).
  if (process.platform === 'win32' && (command === 'opencli' || /[\\/]\.bin[\\/]opencli(?:\.cmd)?$/i.test(command))) {
    try {
      args = [fileURLToPath(import.meta.resolve('@jackwener/opencli')), ...args];
      command = process.execPath;
    } catch (error) {
      return { status: 1, output: `Could not resolve installed OpenCLI: ${error.message}` };
    }
  }
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
