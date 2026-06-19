export function buildResult({
  status,
  mode,
  groupUrl,
  message,
  captionLength,
  imageCount,
  screenshot,
}) {
  return {
    status,
    mode,
    group_url: groupUrl,
    message,
    caption_length: captionLength,
    image_count: imageCount,
    screenshot,
  };
}
