import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installHermesSkill,
  parseArgs,
  SKILL_RELATIVE_PATH,
  TARGET_RELATIVE_PATH,
} from '../scripts/install-hermes-skill.js';

const SKILL_PATH = path.resolve('hermes/skills/social-media/facebook-group-post/SKILL.md');
const EXAMPLES_DIR = path.resolve('hermes/skills/social-media/facebook-group-post/examples');

let tmpHome;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-hermes-home-'));
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('Hermes facebook-group-post skill', () => {
  it('has valid Hermes skill frontmatter', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    expect(content.startsWith('---\n')).toBe(true);

    const closeIndex = content.indexOf('\n---\n', 4);
    expect(closeIndex).toBeGreaterThan(0);
    const frontmatter = parseSimpleYaml(content.slice(4, closeIndex));
    expect(frontmatter.name).toBe('facebook-group-post');
    expect(frontmatter.description).toContain('Telegram or WhatsApp');
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
    expect(frontmatter.version).toBe('1.1.0');
    expect(frontmatter.author).toBe('Ang Jing Kang');
    expect(frontmatter.license).toBe('Apache-2.0');
    expect(content.slice(closeIndex + 5).trim()).toContain('# Facebook Group Post');
  });

  it('instructs Hermes to use the local worker and never direct browser APIs', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    expect(content).toContain('node worker/posting-worker.js --job');
    expect(content).toContain('never call OpenCLI browser primitives');
    expect(content).toContain('Never store Facebook credentials');
    expect(content).toContain('Never run the Facebook browser on Android');
    expect(content).toContain('FB_AUTOPOST_REPO');
  });

  it('requires dry-run first, preview summary, POST confirmation, and worker confirmation', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    expect(content).toContain('Default every initial request to dry-run');
    expect(content).toContain('Never publish from the initial request');
    expect(content).toContain('Reply POST to publish or CANCEL to discard');
    expect(content).toContain('Require the user to reply exactly `POST`');
    expect(content).toContain('--confirm true');
    expect(content).toContain('Draft prepared.');
    expect(content).toContain('Screenshot: <screenshot path>');
    expect(content).toContain('Submitted. Facebook status');
  });

  it('requires missing input questions and reports supported statuses with screenshots', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    expect(content).toContain('Which approved Facebook group should I use?');
    expect(content).toContain('Please send the caption text for this post.');
    expect(content).toContain('Please attach images');
    for (const status of ['posted', 'pending-review', 'failed', 'unknown']) {
      expect(content).toContain(status);
    }
    expect(content).toContain('Include status and screenshot path when available.');
  });

  it('contains example files for WhatsApp flow and worker output', () => {
    const files = fs.readdirSync(EXAMPLES_DIR).sort();
    expect(files).toEqual([
      'dry-run-worker-job.json',
      'pending-review-worker-response.json',
      'telegram-flow.md',
      'whatsapp-flow.md',
    ]);

    const dryRunJob = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, 'dry-run-worker-job.json'), 'utf8'));
    expect(dryRunJob).toMatchObject({
      mode: 'dry-run',
      groupAlias: 'supplier-hardware',
    });

    const pending = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, 'pending-review-worker-response.json'), 'utf8'));
    expect(pending).toMatchObject({
      ok: true,
      status: 'pending-review',
      mode: 'live',
      screenshot: expect.stringContaining('post-'),
    });
  });

  it('documents Hermes Telegram and WhatsApp install and verification commands', () => {
    const telegram = fs.readFileSync(path.resolve('docs/hermes-telegram.md'), 'utf8');
    const doc = fs.readFileSync(path.resolve('docs/hermes-whatsapp.md'), 'utf8');
    expect(telegram).toContain('hermes gateway setup');
    expect(telegram).toContain('numeric ID');
    expect(telegram).toContain('hermes gateway start');
    expect(doc).toContain('node scripts/install-hermes-skill.js --dry-run');
    expect(doc).toContain('hermes skills list');
    expect(doc).toContain('hermes whatsapp');
    expect(doc).toContain('hermes gateway start');
    expect(doc).toContain('Reply POST to publish or CANCEL to discard');
  });
});

describe('install-hermes-skill script', () => {
  it('parses install modes and rejects invalid modes', () => {
    expect(parseArgs(['--dry-run', '--mode', 'symlink', '--force'])).toMatchObject({
      dryRun: true,
      mode: 'symlink',
      force: true,
    });
    expect(() => parseArgs(['--mode', 'invalid'])).toThrow(/copy or symlink/);
  });

  it('dry-run reports source and target without writing files', () => {
    const result = installHermesSkill({
      dryRun: true,
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    expect(result.source).toBe(path.resolve(SKILL_RELATIVE_PATH));
    expect(result.target).toBe(path.join(tmpHome, TARGET_RELATIVE_PATH));
    expect(fs.existsSync(result.target)).toBe(false);
  });

  it('dry-run succeeds when the skill is already installed', () => {
    installHermesSkill({
      mode: 'copy',
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    const result = installHermesSkill({
      dryRun: true,
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    expect(result.dryRun).toBe(true);
    expect(fs.existsSync(path.join(result.target, 'SKILL.md'))).toBe(true);
  });

  it('copies the skill into a Hermes home', () => {
    const result = installHermesSkill({
      mode: 'copy',
      force: false,
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    expect(fs.existsSync(path.join(result.target, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.target, 'examples', 'whatsapp-flow.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.target, 'examples', 'telegram-flow.md'))).toBe(true);
    expect(fs.readFileSync(path.join(tmpHome, '.hermes', '.env'), 'utf8')).toContain(
      `FB_AUTOPOST_REPO="${path.resolve('.')}"`,
    );
    expect(fs.statSync(path.join(tmpHome, '.hermes', '.env')).mode & 0o777).toBe(0o600);
  });

  it('refuses to overwrite without force', () => {
    installHermesSkill({
      mode: 'copy',
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    expect(() =>
      installHermesSkill({
        mode: 'copy',
        home: tmpHome,
        repoRoot: path.resolve('.'),
      }),
    ).toThrow(/already exists/);
  });

  it('can replace with a symlink when forced', () => {
    installHermesSkill({
      mode: 'copy',
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    const result = installHermesSkill({
      mode: 'symlink',
      force: true,
      home: tmpHome,
      repoRoot: path.resolve('.'),
    });

    expect(fs.lstatSync(result.target).isSymbolicLink()).toBe(true);
  });
});

function parseSimpleYaml(frontmatter) {
  const parsed = {};
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    parsed[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return parsed;
}
