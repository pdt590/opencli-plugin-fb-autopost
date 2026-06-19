import { describe, expect, it } from 'vitest';
import { classifySecurityState } from '../src/auth-detection.js';

describe('classifySecurityState', () => {
  it.each([
    [{ url: 'https://www.facebook.com/login', bodyText: '' }, 'login'],
    [{ url: 'https://www.facebook.com/groups/1', title: 'Log in to Facebook', bodyText: '' }, 'login'],
    [{ url: 'https://www.facebook.com/checkpoint/123', bodyText: '' }, 'checkpoint'],
    [{ url: 'https://www.facebook.com/two_step_verification', bodyText: '' }, 'checkpoint'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: 'Enter security code to continue' }, 'checkpoint'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: 'Confirm your identity to continue' }, 'checkpoint'],
    [{ url: 'https://www.facebook.com/captcha/tfbimage', bodyText: '' }, 'captcha'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: 'Please complete this captcha' }, 'captcha'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: "Action blocked. You can't post right now." }, 'blocked'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: 'You cannot post right now. Try again later.' }, 'blocked'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: 'You are temporarily blocked from posting.' }, 'blocked'],
    [{ url: 'https://www.facebook.com/groups/1', bodyText: '操作被阻止' }, 'blocked'],
  ])('classifies %j as %s', (state, kind) => {
    expect(classifySecurityState(state)).toMatchObject({ kind });
  });

  it('returns null for a normal group page', () => {
    expect(
      classifySecurityState({
        url: 'https://www.facebook.com/groups/example',
        title: 'Example Group | Facebook',
        bodyText: 'Write something Photo/video',
      }),
    ).toBeNull();
  });
});
