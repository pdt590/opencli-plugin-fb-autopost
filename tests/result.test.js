import { describe, expect, it } from 'vitest';
import { buildResult } from '../src/result.js';

describe('buildResult', () => {
  it('returns the flat seven-key OpenCLI row shape', () => {
    const row = buildResult({
      status: 'dry-run-ready',
      mode: 'dry-run',
      groupUrl: 'https://www.facebook.com/groups/1',
      message: 'ready',
      captionLength: 5,
      imageCount: 1,
      screenshot: './artifacts/dry-run.png',
    });

    expect(Object.keys(row)).toEqual([
      'status',
      'mode',
      'group_url',
      'message',
      'caption_length',
      'image_count',
      'screenshot',
    ]);
    expect(row).toMatchObject({
      status: 'dry-run-ready',
      mode: 'dry-run',
      group_url: 'https://www.facebook.com/groups/1',
      caption_length: 5,
      image_count: 1,
    });
  });
});
