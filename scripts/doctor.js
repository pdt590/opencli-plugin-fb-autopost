#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describeOpenCliResolution, resolveOpenCliCommand } from '../src/opencli-command.js';
import { parseGroupUrl } from '../src/validate.js';
import { DEFAULT_ARTIFACTS_DIR, isNodeVersionSupported } from './setup.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cwd') args.cwd = path.resolve(readValue(argv, ++index, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown doctor option: ${arg}`);
  }
  return args;
}

export function usage() {
  return [
    'Usage:',
    '  npm run doctor',
    '',
    'Checks local readiness without posting to Facebook.',
  ].join('\n');
}

export async function runDoctor({
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
    return 2;
  }

  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  const repoRoot = path.resolve(args.cwd || cwd);
  const lines = [];
  const say = (line = '') => {
    lines.push(line);
    stdout.write(`${line}\n`);
  };

  say('OpenCLI Facebook group-post doctor');
  say('This command performs non-posting checks only.');
  say('');

  const checks = [];
  checks.push(checkNodeVersion(process.versions.node));
  checks.push(checkPackageDependencies(repoRoot));

  const configCheck = checkConfig(repoRoot);
  checks.push(configCheck);
  checks.push(checkArtifactsWritable(repoRoot, configCheck.settings));

  const opencli = resolveOpenCliCommand(repoRoot, { runCommand });
  checks.push({
    ok: opencli.ok,
    label: describeOpenCliResolution(opencli),
    next: opencli.recovery || '',
    detail: [opencli.globalError, opencli.localError].filter(Boolean).join('\n'),
  });

  if (opencli.ok) {
    checks.push(checkPluginVisible(repoRoot, runCommand, opencli.command));
    checks.push(checkBrowserBridge(repoRoot, runCommand, opencli.command));
    checks.push(checkFacebookLogin(repoRoot, runCommand, opencli.command));
  } else {
    checks.push({
      ok: false,
      label: 'OpenCLI plugin visible',
      next: `${opencli.recovery}\nThen run: npx opencli plugin install "file://$(pwd)"`,
    });
    checks.push({
      ok: false,
      label: 'Browser Bridge available',
      next: `${opencli.recovery}\nThen run: npx opencli doctor`,
    });
    checks.push({
      ok: false,
      label: 'Facebook session readable',
      next: `${opencli.recovery}\nThen log into Facebook manually and run: npx opencli facebook groups`,
    });
  }

  for (const check of checks) {
    say(formatCheck(check));
    if (check.detail && !check.ok) say(indent(check.detail));
  }

  say('');
  say('Safe first test after all checks pass:');
  say('npx opencli facebook group-post --group-url "<approved group url>" --caption "Test draft only. Do not publish." --dry-run true');

  return checks.every((check) => check.ok) ? 0 : 1;
}

export function checkNodeVersion(version) {
  return {
    ok: isNodeVersionSupported(version),
    label: `Node ${version}`,
    next: 'Install Node 20 or newer.',
  };
}

export function checkPackageDependencies(repoRoot) {
  const missing = [];
  for (const relativePath of ['node_modules/@jackwener/opencli', 'node_modules/vitest']) {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) missing.push(relativePath);
  }
  return {
    ok: missing.length === 0,
    label: 'package dependencies present',
    next: 'Run: npm install',
    detail: missing.length ? `Missing: ${missing.join(', ')}` : '',
  };
}

export function checkConfig(repoRoot) {
  const settingsPath = path.join(repoRoot, 'config', 'settings.json');
  const groupsPath = path.join(repoRoot, 'config', 'groups.json');
  let settings;
  let groups;

  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    groups = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
    validateSettings(settings);
    validateGroups(groups);
    return {
      ok: true,
      label: 'local config readable',
      next: '',
      settings,
      groups,
    };
  } catch (error) {
    return {
      ok: false,
      label: 'local config readable',
      next: 'Run: npm run setup -- --group-url "https://www.facebook.com/groups/<GROUP_ID>"',
      detail: error.message,
      settings,
      groups,
    };
  }
}

export function checkArtifactsWritable(repoRoot, settings = {}) {
  const artifactsDir = path.resolve(repoRoot, settings?.artifactsDir || DEFAULT_ARTIFACTS_DIR);
  const probePath = path.join(artifactsDir, `.doctor-${process.pid}.tmp`);
  try {
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(probePath, 'ok');
    fs.rmSync(probePath, { force: true });
    return {
      ok: true,
      label: `artifacts directory writable: ${path.relative(repoRoot, artifactsDir)}`,
      next: '',
    };
  } catch (error) {
    return {
      ok: false,
      label: `artifacts directory writable: ${path.relative(repoRoot, artifactsDir)}`,
      next: 'Choose a writable artifacts directory in config/settings.json.',
      detail: error.message,
    };
  }
}

export function checkPluginVisible(repoRoot, runCommand = defaultRunCommand, openCliCommand = 'opencli') {
  const pluginList = runCommand(openCliCommand, ['plugin', 'list'], { cwd: repoRoot });
  const listOutput = pluginList.output || '';
  if (pluginList.status === 0 && /social-autopost|opencli-plugin-fb-autopost/i.test(listOutput)) {
    return {
      ok: true,
      label: 'OpenCLI plugin visible',
      next: '',
    };
  }

  const help = runCommand(openCliCommand, ['facebook', 'group-post', '--help'], { cwd: repoRoot });
  return {
    ok: help.status === 0,
    label: 'OpenCLI plugin visible',
    next: `Run: ${openCliCommand} plugin install "file://$(pwd)"`,
    detail: help.status === 0 ? '' : `${listOutput}${help.output || ''}`.trim(),
  };
}

export function checkBrowserBridge(repoRoot, runCommand = defaultRunCommand, openCliCommand = 'opencli') {
  const doctor = runCommand(openCliCommand, ['doctor'], { cwd: repoRoot });
  return {
    ok: doctor.status === 0,
    label: 'Browser Bridge available',
    next: `Open Brave or Chrome with the OpenCLI Browser Bridge extension, then run: ${openCliCommand} doctor`,
    detail: doctor.status === 0 ? '' : doctor.output?.trim(),
  };
}

export function checkFacebookLogin(repoRoot, runCommand = defaultRunCommand, openCliCommand = 'opencli') {
  const groups = runCommand(openCliCommand, ['facebook', 'groups'], { cwd: repoRoot });
  const detail = groups.status === 0 ? '' : groups.output?.trim();
  return {
    ok: groups.status === 0,
    label: 'Facebook session readable',
    next: facebookSessionNextStep(detail, openCliCommand),
    detail,
  };
}

export function facebookSessionNextStep(detail = '', openCliCommand = 'opencli') {
  const text = String(detail || '');
  if (/BROWSER_CONNECT|Failed to start opencli daemon|port 19825/i.test(text)) {
    return `Start the OpenCLI daemon manually or free port 19825, then run: ${openCliCommand} facebook groups`;
  }
  return `Log into Facebook manually in the Browser Bridge profile, then run: ${openCliCommand} facebook groups`;
}

export function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') throw new Error('settings.json must be an object');
  if (!settings.artifactsDir || typeof settings.artifactsDir !== 'string') {
    throw new Error('settings.json must contain artifactsDir');
  }
  if (settings.safety?.storesCredentials !== false) {
    throw new Error('settings.json safety.storesCredentials must be false');
  }
}

export function validateGroups(groups) {
  if (!groups || !Array.isArray(groups.groups) || groups.groups.length < 1) {
    throw new Error('groups.json must contain at least one approved group');
  }
  const aliases = new Set();
  for (const group of groups.groups) {
    if (!group.alias || typeof group.alias !== 'string') throw new Error('each group needs an alias');
    if (aliases.has(group.alias)) throw new Error(`duplicate group alias: ${group.alias}`);
    aliases.add(group.alias);
    parseGroupUrl(group.url);
    if (group.approvedForPosting !== true) {
      throw new Error(`group ${group.alias} must set approvedForPosting true`);
    }
  }
}

export function formatCheck(check) {
  if (check.ok) return `[ok] ${check.label}`;
  return `[missing] ${check.label}. Next: ${check.next}`;
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

function indent(text) {
  return String(text)
    .split('\n')
    .filter(Boolean)
    .map((line) => `  ${line}`)
    .join('\n');
}

function isMain(metaUrl) {
  return fileURLToPath(metaUrl) === process.argv[1];
}

if (isMain(import.meta.url)) {
  const status = await runDoctor();
  process.exitCode = status;
}
