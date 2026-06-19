import fs from 'node:fs';
import path from 'node:path';
import { ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGES } from '../src/validate.js';
import { DEFAULT_GRAPH_API_VERSION } from './send-message.js';

export const MIME_TO_EXTENSION = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

export class MediaDownloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

export async function fetchMediaMetadata({
  mediaId,
  accessToken,
  phoneNumberId,
  graphVersion = DEFAULT_GRAPH_API_VERSION,
  fetchImpl = globalThis.fetch,
}) {
  if (!mediaId) throw new MediaDownloadError('WhatsApp image media ID is required');
  if (!accessToken) throw new MediaDownloadError('WHATSAPP_CLOUD_ACCESS_TOKEN is required to download media');
  if (typeof fetchImpl !== 'function') throw new MediaDownloadError('fetch implementation is required');

  const url = buildMediaMetadataUrl({ mediaId, phoneNumberId, graphVersion });
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new MediaDownloadError(`Could not resolve WhatsApp media metadata: HTTP ${response.status}`);
  }

  const metadata = await response.json();
  if (!metadata?.url) throw new MediaDownloadError('WhatsApp media metadata did not include a download URL');
  return metadata;
}

export async function downloadMediaBinary({ url, accessToken, fetchImpl = globalThis.fetch }) {
  if (!url || typeof url !== 'string') throw new MediaDownloadError('WhatsApp media download URL is required');
  if (!accessToken) throw new MediaDownloadError('WHATSAPP_CLOUD_ACCESS_TOKEN is required to download media');
  if (/^file:|^data:/i.test(url)) throw new MediaDownloadError('Only HTTPS WhatsApp media download URLs are allowed');
  if (!/^https:\/\//i.test(url)) throw new MediaDownloadError('Only HTTPS WhatsApp media download URLs are allowed');

  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new MediaDownloadError(`Could not download WhatsApp media: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadWhatsAppImage({
  mediaId,
  draft,
  draftStore,
  accessToken,
  phoneNumberId,
  graphVersion = DEFAULT_GRAPH_API_VERSION,
  fetchImpl = globalThis.fetch,
}) {
  if (!draft?.draftId || !draft?.conversationId) throw new MediaDownloadError('Draft is required for media storage');
  const metadata = await fetchMediaMetadata({
    mediaId,
    accessToken,
    phoneNumberId,
    graphVersion,
    fetchImpl,
  });
  const extension = extensionForMedia(metadata);
  const binary = await downloadMediaBinary({
    url: metadata.url,
    accessToken,
    fetchImpl,
  });
  const storagePath = mediaStoragePath({
    draftStore,
    conversationId: draft.conversationId,
    draftId: draft.draftId,
    mediaId,
    extension,
  });
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  fs.writeFileSync(storagePath, binary);
  validateLocalImageFile(storagePath);

  return {
    mediaId,
    mimeType: metadata.mime_type || metadata.mimeType || null,
    localPath: storagePath,
  };
}

export function extractImageMediaId(message) {
  if (!message || message.type !== 'image') return null;
  return message.image?.id || null;
}

export function extensionForMedia(metadata) {
  const mime = String(metadata?.mime_type || metadata?.mimeType || '').toLowerCase();
  const fromMime = MIME_TO_EXTENSION.get(mime);
  if (fromMime) return fromMime;

  const fromFile = extensionFromUrl(metadata?.url);
  if (fromFile) return fromFile;
  throw new MediaDownloadError(`Unsupported WhatsApp image MIME type: ${mime || 'unknown'}`);
}

export function extensionFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : null;
  } catch {
    return null;
  }
}

export function validateLocalImageFile(filePath) {
  if (/^https?:\/\//i.test(filePath)) {
    throw new MediaDownloadError('Remote image URLs are not allowed as worker inputs');
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new MediaDownloadError(`Unsupported image extension: ${ext || 'none'}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new MediaDownloadError(`Image path is not a file: ${filePath}`);
  return true;
}

export function assertImageCount(currentPaths = [], additionalCount = 1) {
  if ((currentPaths.length + additionalCount) > MAX_IMAGES) {
    throw new MediaDownloadError(`Facebook group-post supports at most ${MAX_IMAGES} images`);
  }
}

export function mediaStoragePath({ draftStore, conversationId, draftId, mediaId, extension }) {
  const safeConversation = sanitizePathPart(conversationId);
  const safeDraft = sanitizePathPart(draftId);
  const safeMedia = sanitizePathPart(mediaId);
  return path.join(draftStore.mediaDir, safeConversation, safeDraft, `${safeMedia}${extension}`);
}

export function buildMediaMetadataUrl({
  mediaId,
  phoneNumberId,
  graphVersion = DEFAULT_GRAPH_API_VERSION,
}) {
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new MediaDownloadError('WHATSAPP_GRAPH_API_VERSION must look like v25.0');
  }
  const base = phoneNumberId
    ? `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`
    : `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`;
  return base;
}

function sanitizePathPart(value) {
  const safe = String(value || '').replace(/[^A-Za-z0-9._-]/g, '_');
  if (!safe) throw new MediaDownloadError('Storage path segment must not be empty');
  return safe;
}
