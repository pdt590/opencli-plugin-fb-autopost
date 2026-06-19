import fs from 'node:fs';
import path from 'node:path';

export const PROCESSED_MESSAGES_FILE = 'processed-messages.json';
export const DEFAULT_MAX_PROCESSED_MESSAGES = 1000;

export function createWebhookEventStore({
  repoRoot = process.cwd(),
  maxEntries = DEFAULT_MAX_PROCESSED_MESSAGES,
} = {}) {
  const baseDir = path.resolve(repoRoot, 'artifacts', 'whatsapp-business');
  return {
    baseDir,
    filePath: path.join(baseDir, PROCESSED_MESSAGES_FILE),
    maxEntries,
  };
}

export function hasProcessedMessage(store, messageId) {
  if (!messageId) return false;
  return readProcessedMessages(store).includes(messageId);
}

export function recordProcessedMessage(store, messageId) {
  if (!messageId) return;
  const messages = readProcessedMessages(store).filter((value) => value !== messageId);
  messages.push(messageId);
  const retained = messages.slice(-store.maxEntries);
  writeProcessedMessages(store, retained);
}

export function readProcessedMessages(store) {
  if (!fs.existsSync(store.filePath)) return [];
  const value = JSON.parse(fs.readFileSync(store.filePath, 'utf8'));
  return Array.isArray(value.messages)
    ? value.messages.filter((item) => typeof item === 'string' && item)
    : [];
}

function writeProcessedMessages(store, messages) {
  fs.mkdirSync(store.baseDir, { recursive: true });
  const tempPath = `${store.filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({ messages }, null, 2)}\n`);
  fs.renameSync(tempPath, store.filePath);
}
