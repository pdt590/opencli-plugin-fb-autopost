#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureArtifactDir } from '../src/artifacts.js';
import { describeOpenCliResolution, resolveOpenCliCommand } from '../src/opencli-command.js';
import { parseGroupUrl } from '../src/validate.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_ARTIFACTS_DIR = './artifacts/facebook-group-post';
export const DEFAULT_GROUP_ALIAS = 'main';

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    yes: false,
    skipPluginInstall: false,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    groupAlias: DEFAULT_GROUP_ALIAS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--skip-plugin-install') args.skipPluginInstall = true;
    else if (arg === '--group-url') args.groupUrl = readValue(argv, ++index, arg);
    else if (arg === '--group-alias') args.groupAlias = readValue(argv, ++index, arg);
    else if (arg === '--group-label') args.groupLabel = readValue(argv, ++index, arg);
    else if (arg === '--artifacts-dir') args.artifactsDir = readValue(argv, ++index, arg);
    else if (arg === '--cwd') args.cwd = path.resolve(readValue(argv, ++index, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown setup option: ${arg}`);
  }

  return args;
}

export function usage() {
  return [
    'Usage:',
    '  npm run setup -- --group-url "https://www.facebook.com/groups/<GROUP_ID>"',
    '',
    'Options:',
    '  --group-url <url>        Approved Facebook group URL to save locally',
    '  --group-alias <alias>    Friendly local name for the group (default: main)',
    '  --group-label <label>    Human readable group label',
    '  --artifacts-dir <dir>    Screenshot directory (default: ./artifacts/facebook-group-post)',
    '  --dry-run               Print actions without writing files or installing plugin',
    '  --skip-plugin-install   Do not run opencli plugin install',
    '  --yes                   Non-interactive mode; fail if --group-url is missing',
  ].join('\n');
}

export async function runSetup({
  argv = process.argv.slice(2),
  cwd = REPO_ROOT,
  stdout = process.stdout,
  stderr = process.stderr,
  stdin = process.stdin,
  runCommand = defaultRunCommand,
  isTTY = Boolean(process.stdin.isTTY),
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
  const configDir = path.join(repoRoot, 'config');
  const settingsPath = path.join(configDir, 'settings.json');
  const groupsPath = path.join(configDir, 'groups.json');
  const artifactsDir = path.resolve(repoRoot, args.artifactsDir);
  const lines = [];
  const say = (line = '') => {
    lines.push(line);
    stdout.write(`${line}\n`);
  };

  say('OpenCLI Facebook group-post setup');
  say('This setup never posts to Facebook, never logs in for you, and never asks for a Facebook password.');
  say('');

  const nodeOk = isNodeVersionSupported(process.versions.node);
  say(statusLine(nodeOk, `Node ${process.versions.node}`, 'Install Node 20 or newer.'));

  const npmInstallOk = fs.existsSync(path.join(repoRoot, 'node_modules', '@jackwener', 'opencli'));
  say(statusLine(npmInstallOk, 'npm dependencies installed', 'Run: npm install'));

  const opencli = resolveOpenCliCommand(repoRoot, { runCommand });
  const opencliOk = opencli.ok;
  if (opencliOk) {
    say(statusLine(true, describeOpenCliResolution(opencli), ''));
  } else {
    say('[missing] OpenCLI command not available. Next:');
    say(indent(opencli.recovery));
  }

  let groupUrl = args.groupUrl;
  if (!groupUrl && isTTY && !args.yes && !args.dryRun) {
    groupUrl = await promptGroupUrl({ stdin, stdout });
  }

  if (!groupUrl) {
    say(statusLine(false, 'Approved group URL saved locally', 'Re-run with: npm run setup -- --group-url "https://www.facebook.com/groups/<GROUP_ID>"'));
  } else {
    try {
      groupUrl = parseGroupUrl(groupUrl);
      say(statusLine(true, `Approved group URL accepted for alias "${args.groupAlias}"`, ''));
    } catch (error) {
      stderr.write(`Invalid --group-url: ${error.message}\n`);
      return 2;
    }
  }

  if (!args.dryRun) {
    fs.mkdirSync(configDir, { recursive: true });
    ensureArtifactDir(artifactsDir);
    fs.writeFileSync(settingsPath, `${JSON.stringify(createSettings(args, repoRoot), null, 2)}\n`);
    if (groupUrl) {
      fs.writeFileSync(groupsPath, `${JSON.stringify(createGroups(args, groupUrl), null, 2)}\n`);
    }
  }

  say(statusLine(true, `Artifacts directory ${args.dryRun ? 'would be created' : 'ready'}: ${path.relative(repoRoot, artifactsDir)}`, ''));
  say(statusLine(true, `${args.dryRun ? 'Would write' : 'Wrote'} local settings: ${path.relative(repoRoot, settingsPath)}`, ''));
  if (groupUrl) {
    say(statusLine(true, `${args.dryRun ? 'Would write' : 'Wrote'} local groups: ${path.relative(repoRoot, groupsPath)}`, ''));
  }

  if (opencliOk && !args.skipPluginInstall) {
    const installRef = `file://${repoRoot}`;
    if (args.dryRun) {
      say(statusLine(true, `Would install local OpenCLI plugin: ${opencli.command} plugin install "${installRef}"`, ''));
    } else {
      const install = runCommand(opencli.command, ['plugin', 'install', installRef], { cwd: repoRoot });
      const alreadyInstalled = isAlreadyInstalledPluginOutput(install.output);
      const installOk = install.status === 0 || alreadyInstalled;
      say(statusLine(
        installOk,
        alreadyInstalled ? 'Local OpenCLI plugin already installed' : 'Local OpenCLI plugin installed',
        `Run manually: ${opencli.command} plugin install "${installRef}"`,
      ));
      if (!installOk && install.output) say(indent(install.output.trim()));
    }
  } else if (!opencliOk) {
    say('[missing] Local OpenCLI plugin installed. Next:');
    say(indent(`${opencli.recovery}\nThen run: npx opencli plugin install "file://$(pwd)"`));
  }

  say('');
  say('Manual browser steps:');
  say('1. Use Brave or Chrome with the OpenCLI Browser Bridge extension.');
  say('2. Log into Facebook manually in that browser profile.');
  say('3. Run: npm run doctor');
  say('4. First posting test must be dry-run only.');

  return lines.some((line) => line.startsWith('[missing]')) ? 1 : 0;
}

export function createSettings(args, repoRoot = REPO_ROOT) {
  return {
    artifactsDir: args.artifactsDir || DEFAULT_ARTIFACTS_DIR,
    preferredBrowser: 'Brave or Chrome with the OpenCLI Browser Bridge extension',
    opencliPluginInstall: `file://${repoRoot}`,
    safety: {
      dryRunDefault: true,
      liveRequiresConfirmTrue: true,
      storesCredentials: false,
      facebookLoginIsManual: true,
    },
  };
}

export function createGroups(args, groupUrl) {
  return {
    groups: [
      {
        alias: args.groupAlias || DEFAULT_GROUP_ALIAS,
        label: args.groupLabel || args.groupAlias || DEFAULT_GROUP_ALIAS,
        url: groupUrl,
        approvedForPosting: true,
      },
    ],
  };
}

export function isNodeVersionSupported(version) {
  const major = Number(String(version).split('.')[0]);
  return Number.isInteger(major) && major >= 20;
}

export function isAlreadyInstalledPluginOutput(output = '') {
  return /Plugin\s+"?fb-autopost"?\s+is already installed/i.test(String(output));
}

export function statusLine(ok, okText, nextStep) {
  if (ok) return `[ok] ${okText}`;
  return `[missing] ${okText}. Next: ${nextStep}`;
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

async function promptGroupUrl({ stdin, stdout }) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const value = await rl.question('Paste the approved Facebook group URL: ');
    return value.trim();
  } finally {
    rl.close();
  }
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function isMain(metaUrl) {
  return fileURLToPath(metaUrl) === process.argv[1];
}

if (isMain(import.meta.url)) {
  const status = await runSetup();
  process.exitCode = status;
}
