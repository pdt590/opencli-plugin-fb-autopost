import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { POST_OUTCOME_SCRIPT, pollPostOutcome } from '../src/composer.js';
function outcome(text, { stale = false, dialog = false, body = '', submission, articles = [] } = {}) {
  const node = { innerText: text, hidden: false, offsetParent: {}, getAttribute: () => null, querySelector: () => null };
  const baseline = new Map(stale ? [[node, text]] : []);
  return vm.runInNewContext(POST_OUTCOME_SCRIPT, {
    Map, URL, location: { href: 'https://www.facebook.com/groups/test/', origin: 'https://www.facebook.com', pathname: '/groups/test/' },
    window: { __opencliPostNotices: baseline, __opencliPostSubmission: submission },
    getComputedStyle: () => ({}),
    document: { body: { innerText: body }, querySelectorAll: selector => selector === '[role="article"]' ? articles : selector === '[role="dialog"]' ? (dialog ? [{ ...node, querySelector: () => ({}), getBoundingClientRect: () => ({ width: 1, height: 1, top: 0 }) }] : []) : [node] },
  });
}
describe('publication evidence', () => {
  it('does not equate a closed composer with success', () => expect(outcome('').status).toBe('waiting'));
  it('ignores old success notifications', () => expect(outcome('Post published', { stale: true }).status).toBe('waiting'));
  it('ignores success text in feed or caption', () => expect(outcome('', { body: 'Post published' }).status).toBe('waiting'));
  it.each(['Post published', 'Bài viết của bạn đã được đăng'])('recognizes new success notice %s', text => expect(outcome(text).status).toBe('posted'));
  it('waits while composer remains open', () => expect(outcome('Post published', { dialog: true }).status).toBe('waiting'));
  it.each([['Your post is pending approval', 'pending-review'], ['Không thể đăng', 'failed']])('recognizes %s', (text, status) => expect(outcome(text).status).toBe(status));
  it('returns unknown when evidence never arrives', async () => {
    expect((await pollPostOutcome({ evaluate: async () => ({ status: 'waiting' }) }, { timeoutMs: 1, intervalMs: 1 })).status).toBe('unknown');
  });
});

describe('feed evidence without a success notification', () => {
  const url = 'https://www.facebook.com/groups/test/posts/123';
  const submission = { caption: 'Muse AI caption', url: 'https://www.facebook.com/groups/test/', startedAt: Date.now(), previousPosts: [] };
  function article({ caption = submission.caption, href = url, time = 'Just now' } = {}) {
    const link = { href, innerText: time, getAttribute: () => null, querySelector: () => null };
    return { offsetParent: {}, getAttribute: () => null, querySelector: () => ({ innerText: caption }), querySelectorAll: () => [link] };
  }
  it('verifies a fresh new group post and returns its permalink', () => {
    expect(outcome('', { submission, articles: [article()] })).toMatchObject({ status: 'posted', evidence: 'feed-post', post_url: url });
  });
  it.each([
    ['old matching post', { ...submission, previousPosts: [url] }, article()],
    ['stale matching post', submission, article({ time: 'Yesterday' })],
    ['different caption', submission, article({ caption: 'Other text' })],
    ['another group', submission, article({ href: 'https://www.facebook.com/groups/other/posts/123' })],
  ])('rejects %s', (_, baseline, post) => {
    expect(outcome('', { submission: baseline, articles: [post] }).status).toBe('waiting');
  });
  it('does not override a moderation notice with feed evidence', () => {
    expect(outcome('Your post is pending approval', { submission, articles: [article()] }).status).toBe('pending-review');
  });
});
