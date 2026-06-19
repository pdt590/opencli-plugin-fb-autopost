import fs from 'node:fs';
import path from 'node:path';

export function ensureArtifactDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function artifactPath(dir, label, date = new Date()) {
  const safeLabel = String(label || 'screenshot').replace(/[^A-Za-z0-9._-]+/g, '-');
  return path.join(dir, `${safeLabel}-${timestampForPath(date)}.png`);
}

export async function captureScreenshot(page, dir, label) {
  ensureArtifactDir(dir);
  const screenshot = artifactPath(dir, label);
  await page.screenshot({ path: screenshot, fullPage: true });
  return screenshot;
}
