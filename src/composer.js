import { CommandExecutionError } from '@jackwener/opencli/errors';
import { captureScreenshot } from './artifacts.js';

export const COMPOSER_TRIGGER_LABELS = [
  'Write something',
  "What's on your mind",
  'Create a public post',
  'Create post',
  'Start a post',
  'Bạn đang nghĩ gì',
  'Tạo bài viết',
  '匿名发帖',
  '写点什么',
  '寫點什麼',
  '建立公開貼文',
  '创建公开帖子',
];

export const PHOTO_BUTTON_LABELS = [
  'Photo/video',
  'Photo',
  'Add photos/videos',
  'Add photo',
  'Ảnh/video',
  'Ảnh/video trực tiếp',
  '照片/视频',
  '照片／影片',
  '添加照片',
  '新增相片',
];

export const POST_BUTTON_LABELS = [
  'Post',
  'Publish',
  'Share',
  'Đăng',
  '发帖',
  '发布',
  '發布',
  '贴文',
];

export const ACTIVE_DIALOG_HELPERS = `
  const elementVisible = (el) => {
    if (!el || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return el.offsetParent !== null || el.getClientRects().length > 0;
  };
  const dialogScore = (dialog, index) => {
    const rect = dialog.getBoundingClientRect();
    const zIndex = Number.parseInt(getComputedStyle(dialog).zIndex, 10);
    return {
      dialog,
      index,
      zIndex: Number.isFinite(zIndex) ? zIndex : 0,
      area: Math.max(0, rect.width) * Math.max(0, rect.height),
      top: rect.top,
    };
  };
  const activeDialog = () => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter(elementVisible)
      .filter((dialog) => dialog.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]'))
      .map(dialogScore)
      .sort((a, b) =>
        (b.zIndex - a.zIndex) ||
        (b.index - a.index) ||
        (b.area - a.area) ||
        (a.top - b.top)
      );
    return dialogs[0]?.dialog || null;
  };
`;

const OPEN_COMPOSER_SCRIPT = `(() => {
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const labelSet = labels.map(normalize).filter(Boolean);
  const visible = (el) => {
    if (!el || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return el.offsetParent !== null || el.getClientRects().length > 0;
  };
  const rectScore = (el) => {
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width < 40 || rect.height < 12) return -10;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return -10000;
    // Prefer in-viewport composer controls near the top of the group discussion.
    return Math.max(0, 2000 - Math.max(0, rect.top));
  };
  const rawCandidates = Array.from(document.querySelectorAll([
    '[role="button"]',
    'button',
    'a[role="button"]',
    '[aria-label]',
    '[role="textbox"]',
    '[contenteditable="true"]',
    'input[placeholder]',
    'textarea[placeholder]',
    'div',
    'span'
  ].join(',')));
  const textFor = (el) => normalize([
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.getAttribute('placeholder'),
    el.innerText,
    el.textContent,
  ].filter(Boolean).join(' '));
  const isButtonLike = (el) => {
    const tag = el.tagName.toLowerCase();
    return tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button';
  };
  const clickableFor = (el) => {
    if (isButtonLike(el)) return el;
    const descendant = Array.from(el.querySelectorAll('[role="button"], button, a[role="button"]'))
      .find((child) => visible(child) && score(textFor(child)) > 0);
    if (descendant) return descendant;
    return el.closest('[role="button"], button, a[role="button"], [tabindex], [aria-label]') || el;
  };
  const disabled = (el) =>
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('disabled') !== null ||
    el.closest('[aria-disabled="true"]');
  const score = (text) => {
    if (!text) return 0;
    if (labelSet.some((label) => text === label)) return 3;
    if (labelSet.some((label) => text.startsWith(label))) return 2;
    if (labelSet.some((label) => text.includes(label))) return 1;
    return 0;
  };
  const candidates = rawCandidates
    .filter((el) => visible(el) && !disabled(el))
    .map((el) => ({ el, text: textFor(el) }))
    .filter((candidate) => candidate.text && candidate.text.length <= 200)
    .map((candidate) => ({ ...candidate, score: score(candidate.text) }))
    .filter((candidate) => candidate.score > 0)
    .map((candidate) => ({ ...candidate, clickTarget: clickableFor(candidate.el) }))
    .filter((candidate) => visible(candidate.clickTarget) && !disabled(candidate.clickTarget))
    .sort((a, b) => {
      const roleDelta = Number(isButtonLike(b.clickTarget)) - Number(isButtonLike(a.clickTarget));
      return (b.score - a.score)
        || roleDelta
        || (rectScore(b.clickTarget) - rectScore(a.clickTarget))
        || (a.text.length - b.text.length);
    });
  if (!candidates.length) return { clicked: false };
  candidates[0].clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
  candidates[0].clickTarget.click();
  return { clicked: true, label: candidates[0].text, score: candidates[0].score };
})()`;

const DIALOG_STATE_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (dialog) {
    const editor = dialog.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
    return {
      found: true,
      editorText: editor.innerText || editor.textContent || '',
      dialogText: (dialog.innerText || '').slice(0, 2000)
    };
  }
  return { found: false };
})()`;

const FOCUS_EDITOR_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { focused: false, reason: 'dialog-not-found' };
  const editor = dialog.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
  editor.scrollIntoView({ block: 'center', inline: 'center' });
  editor.focus();
  return { focused: true, text: editor.innerText || editor.textContent || '' };
})()`;

const VERIFY_CAPTION_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const wanted = normalize(caption);
  const dialog = activeDialog();
  if (!dialog) return { verified: false, reason: 'dialog-not-found' };
  const editor = dialog.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
  const text = normalize(editor.innerText || editor.textContent || '');
  return { verified: text.includes(wanted), text };
})()`;

const FOCUS_EDITOR_END_SCRIPT = FOCUS_EDITOR_SCRIPT.replace(
  'editor.focus();',
  `editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);`,
);

const EXEC_COMMAND_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { inserted: false, reason: 'dialog-not-found' };
  const editor = dialog.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
  editor.focus();
  const inserted = document.execCommand && document.execCommand('insertText', false, caption);
  return { inserted: Boolean(inserted) };
})()`;

const PASTE_FALLBACK_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { inserted: false, reason: 'dialog-not-found' };
  const editor = dialog.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
  editor.focus();
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', caption);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    const accepted = editor.dispatchEvent(event);
    if (accepted) {
      document.execCommand && document.execCommand('insertText', false, caption);
    }
  } catch {
    document.execCommand && document.execCommand('insertText', false, caption);
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: caption }));
  return { inserted: true };
})()`;

const FIND_ENABLED_POST_BUTTON_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const labelSet = labels.map(normalize).filter(Boolean);
  const dialog = activeDialog();
  if (!dialog) return { found: false, reason: 'dialog-not-found' };
  const buttons = Array.from(dialog.querySelectorAll('[role="button"], button')).filter(elementVisible);
  const disabled = (el) =>
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('disabled') !== null ||
    el.closest('[aria-disabled="true"]') ||
    el.tabIndex < -1;
  for (const el of buttons) {
    const text = normalize([
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.innerText,
      el.textContent,
    ].filter(Boolean).join(' '));
    const matched = labelSet.some((label) => text === label || text.startsWith(label));
    if (matched) {
      return {
        found: true,
        enabled: !disabled(el),
        label: text
      };
    }
  }
  return { found: false, reason: 'button-not-found' };
})()`;

export const POST_FEED_HELPERS = `
  const normalizeCaption = value => String(value || '').replace(/\\s+/g, ' ').trim();
  const feedPosts = () => Array.from(document.querySelectorAll('[role="article"]'))
    .filter(elementVisible).flatMap(article => {
      const message = article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
      if (!message) return [];
      return Array.from(article.querySelectorAll('a[href]')).flatMap(link => {
        let url;
        try { url = new URL(link.href, location.href); } catch { return []; }
        if (url.origin !== location.origin) return [];
        const group = location.pathname.match(/^\\/groups\\/([^/]+)/);
        if (group && !url.pathname.startsWith('/groups/' + group[1] + '/')) return [];
        if (!/\\/(posts|permalink)\\/[^/]+/.test(url.pathname)) return [];
        const id = url.origin + url.pathname.replace(/\\/$/, '');
        const time = link.querySelector('time');
        const date = time?.getAttribute('datetime');
        const labels = [link.innerText, link.getAttribute('aria-label'), time?.textContent].filter(Boolean);
        const fresh = labels.some(label => /^(just now|vừa xong|vừa mới|刚刚|剛剛)$/i.test(label.trim())) ||
          (date && Date.parse(date) >= (window.__opencliPostSubmission?.startedAt || Infinity) - 5000);
        return [{ id, caption: normalizeCaption(message.innerText || message.textContent), fresh: Boolean(fresh) }];
      });
    });
`;

const CLICK_POST_BUTTON_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  ${POST_FEED_HELPERS}
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const labelSet = labels.map(normalize).filter(Boolean);
  const dialog = activeDialog();
  if (!dialog) return { clicked: false, reason: 'dialog-not-found' };
  const buttons = Array.from(dialog.querySelectorAll('[role="button"], button')).filter(elementVisible);
  const disabled = (el) =>
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('disabled') !== null ||
    el.closest('[aria-disabled="true"]') ||
    el.tabIndex < -1;
  for (const el of buttons) {
    const text = normalize([
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.innerText,
      el.textContent,
    ].filter(Boolean).join(' '));
    const matched = labelSet.some((label) => text === label || text.startsWith(label));
    if (matched && !disabled(el)) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      window.__opencliPostNotices = new Map(
        Array.from(document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]'))
          .map(node => [node, node.innerText || node.textContent || ''])
      );
      window.__opencliPostSubmission = {
        caption: normalizeCaption(expectedCaption),
        startedAt: Date.now(),
        url: location.href,
        previousPosts: feedPosts().map(post => post.id),
      };
      el.click();
      return { clicked: true, label: text };
    }
  }
  return { clicked: false, reason: 'button-not-found-or-disabled' };
})()`;

export const POST_OUTCOME_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  ${POST_FEED_HELPERS}
  const baseline = window.__opencliPostNotices;
  if (!(baseline instanceof Map)) return { status: 'waiting', message: 'No submission evidence baseline.' };
  const notices = Array.from(document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]'))
    .filter(elementVisible)
    .filter(node => !node.querySelector('[role="article"], [data-ad-preview="message"]'))
    .filter(node => baseline.get(node) !== (node.innerText || node.textContent || ''));
  const text = notices.map(node => node.innerText || node.textContent || '').join(' ').replace(/\\s+/g, ' ').trim();
  const pending = /pending approval|submitted for review|submitted to (the )?admins?|your post is pending|đang chờ phê duyệt|đang chờ duyệt|đã gửi.*phê duyệt|等待批准|待审核|待審核/i;
  const failed = /action blocked|you can't post right now|try again later|failed to post|couldn't publish|couldn't post|không thể đăng|đăng bài thất bại|无法发布|無法發布/i;
  const success = /your post (is now published|was published|has been published|was shared|has been shared)|post published|posted successfully|bài viết (của bạn )?đã được (đăng|chia sẻ)|đăng bài thành công|发布成功|發佈成功/i;
  if (failed.test(text)) return { status: 'failed', message: 'Facebook showed a new posting error after submission.' };
  if (pending.test(text)) return { status: 'pending-review', message: 'Facebook confirmed submission for review; not published yet.' };
  if (!activeDialog() && success.test(text)) {
    return { status: 'posted', message: 'Facebook displayed a new publication success notification after submission.' };
  }
  const submission = window.__opencliPostSubmission;
  if (!activeDialog() && submission?.caption && submission.url === location.href) {
    const post = feedPosts().find(post => post.caption === submission.caption && post.fresh &&
      !submission.previousPosts.includes(post.id));
    if (post) return {
      status: 'posted', evidence: 'feed-post', post_url: post.id,
      message: 'Verified a new, freshly timestamped feed post with the exact submitted caption and a new permalink.',
    };
  }
  return { status: 'waiting', message: 'Waiting for explicit Facebook publication evidence; composer closure alone is insufficient.' };
})()`;

export async function openComposer(page, { screenshotDir, timeoutMs = 10000, intervalMs = 250 } = {}) {
  const clicked = await evaluateWithArgs(page, OPEN_COMPOSER_SCRIPT, {
    labels: COMPOSER_TRIGGER_LABELS,
  });

  if (!clicked?.clicked) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'composer-trigger-not-found');
    throw new CommandExecutionError(
      `Could not find Facebook composer trigger. UI may have changed. Screenshot: ${screenshot}`,
    );
  }

  const dialog = await poll(
    () => page.evaluate(DIALOG_STATE_SCRIPT),
    (state) => state?.found,
    { timeoutMs, intervalMs },
  );

  if (!dialog?.found) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'composer-dialog-not-found');
    throw new CommandExecutionError(
      `Facebook composer dialog did not open. UI may have changed. Screenshot: ${screenshot}`,
    );
  }

  return { trigger: clicked, dialog };
}

export async function insertCaption(page, caption, { screenshotDir, timeoutMs = 10000, intervalMs = 250, slow = false } = {}) {
  const focused = await page.evaluate(FOCUS_EDITOR_SCRIPT);
  if (!focused?.focused) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'composer-editor-not-found');
    throw new CommandExecutionError(`Could not focus Facebook composer editor. Screenshot: ${screenshot}`);
  }

  if (slow) {
    if (typeof page.insertText !== 'function' || String(focused.text || '').trim()) {
      const screenshot = await captureScreenshot(page, screenshotDir, 'paced-input-not-ready');
      throw new CommandExecutionError(`Paced input requires insertText support and an empty editor; discard any existing draft first. Screenshot: ${screenshot}`);
    }
    // Segment by grapheme so Vietnamese combining marks and emoji stay intact.
    const units = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(caption), part => part.segment);
    try {
      for (let index = 0; index < units.length; index += 12) {
        if (index > 0) {
          await delay(200);
          // React editors can restore a stale selection between insertions.
          // Append at the visible editor's end after each rendering pause.
          const caret = await page.evaluate(FOCUS_EDITOR_END_SCRIPT);
          if (!caret?.focused) throw new Error('Composer editor disappeared');
        }
        await page.insertText(units.slice(index, index + 12).join(''));
      }
    } catch {
      const screenshot = await captureScreenshot(page, screenshotDir, 'paced-input-interrupted');
      throw new CommandExecutionError(`Paced input stopped after an interrupted insert. Review the partial draft manually; no fallback or retry was attempted. Screenshot: ${screenshot}`);
    }
    if (await captionVerified(page, caption, { timeoutMs, intervalMs })) {
      return { inserted: true, method: 'paced-insertText' };
    }
    const screenshot = await captureScreenshot(page, screenshotDir, 'paced-caption-not-verified');
    throw new CommandExecutionError(`Paced caption was not verified. Review the draft manually; no fallback or retry was attempted. Screenshot: ${screenshot}`);
  }

  if (typeof page.insertText === 'function') {
    try {
      await page.insertText(caption);
      if (await captionVerified(page, caption, { timeoutMs, intervalMs })) {
        return { inserted: true, method: 'insertText' };
      }
    } catch {
      // Older or interrupted Browser Bridge sessions may not support CDP insertText.
      // Continue to explicit DOM fallbacks and verify before accepting success.
    }
  }

  await evaluateWithArgs(page, EXEC_COMMAND_SCRIPT, { caption });
  if (await captionVerified(page, caption, { timeoutMs: Math.min(timeoutMs, 3000), intervalMs })) {
    return { inserted: true, method: 'execCommand' };
  }

  await evaluateWithArgs(page, PASTE_FALLBACK_SCRIPT, { caption });
  if (await captionVerified(page, caption, { timeoutMs: Math.min(timeoutMs, 3000), intervalMs })) {
    return { inserted: true, method: 'paste' };
  }

  const screenshot = await captureScreenshot(page, screenshotDir, 'caption-not-verified');
  throw new CommandExecutionError(`Caption was not verified in the Facebook composer. Screenshot: ${screenshot}`);
}

export async function captionVerified(page, caption, { timeoutMs = 10000, intervalMs = 250 } = {}) {
  const result = await poll(
    () => evaluateWithArgs(page, VERIFY_CAPTION_SCRIPT, { caption }),
    (state) => state?.verified,
    { timeoutMs, intervalMs },
  );
  return Boolean(result?.verified);
}

export async function findEnabledPostButton(page) {
  return evaluateWithArgs(page, FIND_ENABLED_POST_BUTTON_SCRIPT, {
    labels: POST_BUTTON_LABELS,
  });
}

export async function clickPostButton(page, { screenshotDir, caption = '' } = {}) {
  const state = await findEnabledPostButton(page);
  if (!state?.found || !state.enabled) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'post-button-not-ready');
    throw new CommandExecutionError(`Facebook Post button is not enabled. Screenshot: ${screenshot}`);
  }

  const clicked = await evaluateWithArgs(page, CLICK_POST_BUTTON_SCRIPT, {
    labels: POST_BUTTON_LABELS,
    expectedCaption: caption,
  });
  if (!clicked?.clicked) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'post-button-click-failed');
    throw new CommandExecutionError(`Could not click Facebook Post button. Screenshot: ${screenshot}`);
  }

  return clicked;
}

export async function pollPostOutcome(page, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const result = await poll(
    () => page.evaluate(POST_OUTCOME_SCRIPT),
    (state) => state?.status && state.status !== 'waiting',
    { timeoutMs, intervalMs },
  );

  return result?.status && result.status !== 'waiting'
    ? result
    : {
        status: 'unknown',
        message: 'Post button clicked but final result is unclear. Check Facebook manually.',
      };
}

export async function verifyGroupPageLoaded(page, groupUrl, { screenshotDir } = {}) {
  const state = await page.evaluate(`(() => ({
    url: window.location.href,
    hasHeading: Boolean(document.querySelector('h1, [role="heading"]')),
    text: (document.body && document.body.innerText || '').slice(0, 2000)
  }))()`);

  if (!state?.url?.includes('/groups/') || !state.hasHeading) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'group-page-not-loaded');
    throw new CommandExecutionError(
      `Facebook group page did not appear to load for ${groupUrl}. Screenshot: ${screenshot}`,
    );
  }

  return state;
}

export async function poll(producer, predicate, { timeoutMs, intervalMs }) {
  const start = Date.now();
  let last;

  do {
    last = await producer();
    if (predicate(last)) return last;
    await delay(intervalMs);
  } while (Date.now() - start < timeoutMs);

  return last;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function evaluateWithArgs(page, js, args) {
  const declarations = Object.entries(args)
    .map(([key, value]) => {
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
        throw new Error(`evaluateWithArgs: invalid key "${key}"`);
      }
      return `const ${key} = __opencliPluginArgs[${JSON.stringify(key)}];`;
    })
    .join('\n');
  return page.evaluate(`((__opencliPluginArgs) => {
${declarations}
return (${js});
})(${JSON.stringify(args)})`);
}
