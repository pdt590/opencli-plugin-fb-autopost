import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { artifactPath, captureScreenshot, ensureArtifactDir, timestampForPath } from '../src/artifacts.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-artifacts-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('artifacts', () => {
  it('creates artifact directories', () => {
    const dir = path.join(tmpDir, 'nested', 'artifacts');
    ensureArtifactDir(dir);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('generates safe timestamped paths', () => {
    expect(timestampForPath(new Date('2026-06-12T12:34:56.789Z'))).toBe('2026-06-12T12-34-56-789Z');
    expect(artifactPath(tmpDir, 'bad label!', new Date('2026-06-12T12:34:56.789Z'))).toBe(
      path.join(tmpDir, 'bad-label--2026-06-12T12-34-56-789Z.png'),
    );
  });

  it('captures screenshots to the requested directory', async () => {
    const page = {
      screenshot: async ({ path: screenshotPath }) => {
        fs.writeFileSync(screenshotPath, 'png');
      },
    };

    const screenshot = await captureScreenshot(page, path.join(tmpDir, 'shots'), 'dry-run');
    expect(fs.existsSync(screenshot)).toBe(true);
  });
});
