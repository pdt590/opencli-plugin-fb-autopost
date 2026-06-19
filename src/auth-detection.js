import {
  AuthRequiredError,
  CommandExecutionError,
  LoginWallError,
} from '@jackwener/opencli/errors';
import { captureScreenshot } from './artifacts.js';

export const SECURITY_PATTERNS = [
  {
    kind: 'login',
    url: [/\/login(?:\.php)?(?:[/?#]|$)/i, /\/recover(?:\/|$)/i],
    text: [
      /log in to facebook/i,
      /you must log in to continue/i,
      /log into facebook/i,
      /登录 facebook/i,
      /登入 facebook/i,
      /你必须先登录/i,
      /你必須先登入/i,
    ],
  },
  {
    kind: 'checkpoint',
    url: [/\/checkpoint(?:\/|$)/i, /two_step_verification/i],
    text: [
      /confirm your identity/i,
      /enter security code/i,
      /try another way/i,
      /suspicious activity/i,
      /security check/i,
      /身份验证/i,
      /確認你的身分/i,
      /安全验证码/i,
      /安全驗證碼/i,
    ],
  },
  {
    kind: 'captcha',
    url: [/captcha/i],
    text: [/captcha/i, /security check/i, /i'm not a robot/i, /不是机器人/i, /不是機器人/i],
  },
  {
    kind: 'blocked',
    text: [
      /action blocked/i,
      /you can't post right now/i,
      /you cannot post right now/i,
      /temporarily blocked/i,
      /try again later/i,
      /操作被阻止/i,
      /你暂时无法发帖/i,
      /你暫時無法發帖/i,
    ],
  },
];

export function classifySecurityState({ url = '', bodyText = '', title = '' } = {}) {
  const haystack = `${title}\n${bodyText}`;

  for (const pattern of SECURITY_PATTERNS) {
    for (const urlRegex of pattern.url || []) {
      if (urlRegex.test(url)) {
        return { kind: pattern.kind, matched: `url:${urlRegex.source}` };
      }
    }

    for (const textRegex of pattern.text || []) {
      if (textRegex.test(haystack)) {
        return { kind: pattern.kind, matched: `text:${textRegex.source}` };
      }
    }
  }

  return null;
}

export async function readPageSecurityState(page) {
  return page.evaluate(`(() => ({
    url: window.location.href,
    title: document.title || '',
    bodyText: (document.body && document.body.innerText || '').slice(0, 8000)
  }))()`);
}

export async function assertSafePage(page, { screenshotDir, label = 'security-state' }) {
  const pageState = await readPageSecurityState(page);
  const securityState = classifySecurityState(pageState);

  if (!securityState) {
    return pageState;
  }

  const screenshot = await captureScreenshot(page, screenshotDir, label);
  const message = `Facebook is showing a ${securityState.kind} state (${securityState.matched}). Screenshot: ${screenshot}`;
  const url = pageState?.url || 'https://www.facebook.com';
  const bodyPreview = String(pageState?.bodyText || '').slice(0, 100);

  if (securityState.kind === 'login') {
    throw new AuthRequiredError('www.facebook.com', message);
  }

  if (securityState.kind === 'checkpoint' || securityState.kind === 'captcha') {
    throw new LoginWallError(
      message,
      200,
      url,
      bodyPreview,
      'Resolve the Facebook checkpoint, CAPTCHA, or login wall manually in Chrome, then retry.',
    );
  }

  throw new CommandExecutionError(message);
}
