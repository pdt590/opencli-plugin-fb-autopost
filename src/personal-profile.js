import { CommandExecutionError } from '@jackwener/opencli/errors';
import { captureScreenshot } from './artifacts.js';

// /me resolves the identity selected in Facebook, independently of other Chrome profiles.
// Require the owner-only personal profile controls before touching its composer.
export function isPersonalProfileUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['www.facebook.com', 'facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname)) return false;
    if (url.pathname === '/profile.php') return /^\d+$/.test(url.searchParams.get('id') || '');
    const slug = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    return /^[a-zA-Z0-9.]+$/.test(slug) && !new Set(['me', 'groups', 'pages', 'login', 'checkpoint', 'home.php', 'settings', 'watch', 'reels', 'friends', 'marketplace']).has(slug.toLowerCase());
  } catch { return false; }
}

export async function verifyPersonalProfileLoaded(page, targetUrl, { screenshotDir } = {}) {
  const state = await page.evaluate(`(() => {
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const labels = [...document.querySelectorAll('a,button,[role="button"]')].filter(visible)
      .map(el => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim());
    const matches = patterns => labels.some(label => patterns.some(pattern => pattern.test(label)));
    return {
      url: location.href,
      ownProfile: matches([/^Edit profile$/i, /^Chỉnh sửa trang cá nhân$/i, /^编辑个人资料$/, /^編輯個人檔案$/]) &&
        matches([/^Add to story$/i, /^Thêm vào tin$/i, /^添加到快拍$/, /^新增到限時動態$/]),
      hasComposer: matches([/^What's on your mind/i, /^Bạn đang nghĩ gì/i, /^Create post$/i, /^Tạo bài viết$/i, /^写点什么/, /^在想些什麼/]),
    };
  })()`);
  if (!isPersonalProfileUrl(state?.url) || !state.ownProfile || !state.hasComposer) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'personal-profile-not-verified');
    throw new CommandExecutionError(`Could not verify your own personal profile at ${targetUrl}. Select your personal identity in Facebook (not a Page), then retry. Screenshot: ${screenshot}`);
  }
  return state;
}
