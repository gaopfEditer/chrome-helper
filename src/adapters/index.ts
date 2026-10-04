import type { Platform, PlatformConfig } from '../types';
import { BasePlatformAdapter } from './base-adapter';
import { BinanceAdapter } from './binance-adapter';
import { OKXAdapter } from './okx-adapter';
import { GateAdapter } from './gate-adapter';

export function createAdapter(platform: Platform, config: PlatformConfig): BasePlatformAdapter {
  switch (platform) {
    case 'binance':
      return new BinanceAdapter(config);
    case 'okx':
      return new OKXAdapter(config);
    case 'gate':
      return new GateAdapter(config);
    default:
      throw new Error(`不支持的平台: ${platform}`);
  }
}

export const DEFAULT_PLATFORM_SELECTORS: Record<Platform, Record<string, string[]>> = {
  binance: {
    // Verified on public Binance Square pages (2026-10); reply input/submit require login — not verified logged-in
    postsContainer: ['.feed-list-container', '.feed-layout-main', 'main'],
    postItem: ['.feed-card', '.FeedBuzzBaseViewRootBox', '[data-id][data-prefetch-path*="/square/post/"]'],
    postContent: ['.feed-content-text', '.card-content-box'],
    authorName: ['.avatar-nick-box', '.avatar-name-container a[href*="/square/profile/"]'],
    postTime: ['.create-time', 'time'],
    replyButton: ['button.bn-button__primary', '[class*="reply"]', 'button[aria-label*="评论"]', 'button[aria-label*="回复"]'],
    replyInput: ['textarea', '[contenteditable="true"]', '.comment-input', 'textarea[placeholder*="评论"]'],
    submitButton: ['button.bn-button__primary:not(.inactive)', 'button[type="submit"]', '[class*="submit"]'],
    captcha: ['[class*="captcha"]', 'iframe[src*="captcha"]'],
    rateLimit: ['[class*="rate"]', '[class*="limit"]'],
    loginWall: ['a[href*="login"]', 'button.bn-button__secondary', '.inactive'],
  },
  okx: {
    postsContainer: ['[class*="feed"]', '[class*="list"]', 'main', '[role="feed"]'],
    postItem: ['[class*="feed-item"]', '[class*="post-item"]', 'article', '[data-testid*="post"]'],
    postContent: ['[class*="content"]', '[class*="text"]', 'p', '[class*="body"]'],
    authorName: ['[class*="author"]', '[class*="username"]', '[class*="user"]'],
    postTime: ['time', '[class*="time"]', '[class*="date"]'],
    replyButton: ['[class*="comment"]', '[class*="reply"]', 'button[aria-label*="Comment"]'],
    replyInput: ['textarea', 'input[type="text"]', '[contenteditable="true"]'],
    submitButton: ['button[type="submit"]', '[class*="submit"]', '[class*="post"]'],
    captcha: ['[class*="captcha"]', '[class*="verify"]'],
    rateLimit: ['[class*="limit"]', '[class*="error"]'],
    loginWall: ['[href*="login"]', 'button:has-text("Sign In")'],
  },
  gate: {
    postsContainer: ['[class*="square"]', '[class*="feed"]', '[class*="posts"]', 'main'],
    postItem: ['[class*="post"]', '[class*="item"]', 'article', '[class*="card"]'],
    postContent: ['[class*="content"]', '[class*="text"]', 'p', '[class*="description"]'],
    authorName: ['[class*="author"]', '[class*="username"]', '[class*="nickname"]'],
    postTime: ['time', '[class*="time"]', '[class*="date"]'],
    replyButton: ['[class*="comment"]', '[class*="reply"]', 'button[aria-label*="评论"]'],
    commentButton: ['[class*="comment"]', 'button:has-text("评论")'],
    replyInput: ['textarea', 'input[type="text"]', '[contenteditable="true"]'],
    submitButton: ['button[type="submit"]', '[class*="submit"]', '[class*="send"]'],
    captcha: ['[class*="captcha"]', '[class*="verify"]'],
    rateLimit: ['[class*="limit"]', '[class*="restricted"]'],
    loginWall: ['[href*="login"]', 'button:has-text("登录")'],
  },
};

export * from './base-adapter';
export * from './binance-adapter';
export * from './okx-adapter';
export * from './gate-adapter';
