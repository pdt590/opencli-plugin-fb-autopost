import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { packageEntries, packageLocal, parseArgs } from '../scripts/package-local.js';

describe('local package', () => {
  it('includes runtime, tests and the unified skill', () => {
    expect(packageEntries()).toEqual(expect.arrayContaining(['person-post.js','group-post.js','src','worker','skills','tests']));
    for (const entry of packageEntries()) expect(fs.existsSync(entry), entry).toBe(true);
  });
  it('previews without invoking tar', () => {
    const run = vi.fn();
    expect(packageLocal({dryRun: true}, run).dryRun).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it('builds one tar archive with the expected files', () => {
    const run = vi.fn(() => ({status:0}));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-package-'));
    try { packageLocal({outDir},run); }
    finally { fs.rmSync(outDir, { recursive: true, force: true }); }
    expect(run).toHaveBeenCalledWith('tar',expect.arrayContaining(['-czf','skills']),expect.any(Object));
  });
  it('rejects unsupported packaging flags', () => { expect(() => parseArgs(['--invalid'])).toThrow(); });
});

describe('documentation', () => {
  it('has valid local README and skill links', () => {
    for(const file of ['README.md','skills/social-autopost/SKILL.md']) {
      const text=fs.readFileSync(file,'utf8');
      for(const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        if(!/^(https?:|#)/.test(match[1])) expect(fs.existsSync(path.resolve(path.dirname(file),match[1].split('#')[0])),match[1]).toBe(true);
      }
    }
  });
});
