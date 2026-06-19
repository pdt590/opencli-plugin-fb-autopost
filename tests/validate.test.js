import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  coerceBoolean,
  parseGroupUrl,
  resolveCaption,
  resolveImages,
  resolveMode,
} from '../src/validate.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-group-post-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(name, contents = 'x') {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe('parseGroupUrl', () => {
  it('accepts common Facebook group URL forms', () => {
    expect(parseGroupUrl('https://www.facebook.com/groups/12345')).toBe('https://www.facebook.com/groups/12345');
    expect(parseGroupUrl('https://facebook.com/groups/my.group_slug-1/')).toBe(
      'https://facebook.com/groups/my.group_slug-1/',
    );
    expect(parseGroupUrl('https://m.facebook.com/groups/example?ref=share')).toBe(
      'https://m.facebook.com/groups/example?ref=share',
    );
  });

  it('rejects non-group Facebook URLs and non-Facebook hosts', () => {
    expect(() => parseGroupUrl('https://www.facebook.com/profile.php?id=1')).toThrow(/groups/);
    expect(() => parseGroupUrl('https://www.facebook.com/groups/1/permalink/2')).toThrow(/groups/);
    expect(() => parseGroupUrl('https://example.com/groups/1')).toThrow(/facebook/);
    expect(() => parseGroupUrl('not a url')).toThrow(/full Facebook group URL/);
  });
});

describe('resolveCaption', () => {
  it('uses direct caption text', () => {
    expect(resolveCaption({ caption: 'hello' })).toBe('hello');
  });

  it('reads caption text from a UTF-8 file', () => {
    const captionFile = writeFixture('caption.txt', 'from file\n');
    expect(resolveCaption({ captionFile })).toBe('from file\n');
  });

  it('rejects missing, empty, duplicate, and unreadable captions', () => {
    expect(() => resolveCaption({})).toThrow(/one of/);
    expect(() => resolveCaption({ caption: '   ' })).toThrow(/empty/);
    expect(() => resolveCaption({ caption: 'x', captionFile: 'caption.txt' })).toThrow(/not both/);
    expect(() => resolveCaption({ captionFile: path.join(tmpDir, 'missing.txt') })).toThrow(/not readable/);
  });
});

describe('resolveImages', () => {
  it('returns an empty list when no images are provided', () => {
    expect(resolveImages()).toEqual([]);
    expect(resolveImages('')).toEqual([]);
  });

  it('validates image files and returns absolute paths', () => {
    const one = writeFixture('one.jpg');
    const two = writeFixture('two.PNG');
    expect(resolveImages(`${one}, ${two}`)).toEqual([path.resolve(one), path.resolve(two)]);
  });

  it('rejects missing files, bad extensions, directories, and more than ten images', () => {
    expect(() => resolveImages(path.join(tmpDir, 'missing.jpg'))).toThrow(/does not exist/);
    expect(() => resolveImages(writeFixture('not-image.txt'))).toThrow(/Unsupported image extension/);
    expect(() => resolveImages(tmpDir)).toThrow(/Unsupported image extension|not a file/);

    const eleven = Array.from({ length: 11 }, (_, index) => writeFixture(`${index}.jpg`)).join(',');
    expect(() => resolveImages(eleven)).toThrow(/at most 10/);
  });
});

describe('resolveMode', () => {
  it('defaults to dry-run and accepts confirm true for live mode', () => {
    expect(resolveMode({})).toBe('dry-run');
    expect(resolveMode({ dryRun: 'false', confirm: 'false' })).toBe('dry-run');
    expect(resolveMode({ confirm: true })).toBe('live');
    expect(resolveMode({ confirm: '1' })).toBe('live');
  });

  it('rejects dry-run and confirm together', () => {
    expect(() => resolveMode({ dryRun: true, confirm: 'true' })).toThrow(/either --dry-run true or --confirm true/);
  });
});

describe('coerceBoolean', () => {
  it('treats only true values as true', () => {
    expect(coerceBoolean(true)).toBe(true);
    expect(coerceBoolean(1)).toBe(true);
    expect(coerceBoolean('true')).toBe(true);
    expect(coerceBoolean('1')).toBe(true);
    expect(coerceBoolean(false)).toBe(false);
    expect(coerceBoolean('false')).toBe(false);
    expect(coerceBoolean(undefined)).toBe(false);
  });
});
