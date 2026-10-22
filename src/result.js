export function buildResult({
  status,
  mode,
  groupUrl,
  profileUrl,
  message,
  captionLength,
  imageCount,
  screenshot,
}) {
  return {
    status,
    mode,
    ...(profileUrl ? { profile_url: profileUrl } : { group_url: groupUrl }),
    message,
    caption_length: captionLength,
    image_count: imageCount,
    screenshot,
  };
}
