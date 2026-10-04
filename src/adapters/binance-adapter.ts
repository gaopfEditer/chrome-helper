import { BasePlatformAdapter, FetchResult, PostReplyResult } from './base-adapter';
import type { Post, PlatformConfig } from '../types';
import { generateId, sleep, randomInt } from '../utils/helpers';

export class BinanceAdapter extends BasePlatformAdapter {
  constructor(config: PlatformConfig) {
    super('binance', config);
  }

  async fetchUserPosts(profileUrl: string, maxPosts: number): Promise<FetchResult> {
    this.log(`开始获取用户帖子: ${profileUrl}, 最多 ${maxPosts} 条`);

    try {
      const postsContainer = await this.waitForElement('postsContainer', 35000);
      if (!postsContainer) {
        if (await this.detectBlocked()) {
          return { success: false, error: '未找到帖子列表，可能未登录或页面结构已变更', blockedDetected: true };
        }
        return { success: false, error: '未找到帖子容器（.feed-list-container），请检查资料页 URL 或更新选择器' };
      }

      const posts: Post[] = [];
      let attempts = 0;
      const maxAttempts = 8;

      while (posts.length < maxPosts && attempts < maxAttempts) {
        const selectorList = this.config.selectors.postItem?.length
          ? this.config.selectors.postItem
          : ['.feed-card'];
        const postElements = postsContainer.querySelectorAll<HTMLElement>(selectorList.join(','));

        this.log(`当前找到 ${postElements.length} 个帖子元素`);

        for (const postEl of Array.from(postElements)) {
          if (posts.length >= maxPosts) break;

          try {
            const idEl = postEl.querySelector('[data-id]') || postEl.closest('[data-id]') || postEl;
            const postId =
              idEl.getAttribute('data-id') ||
              postEl.getAttribute('data-post-id') ||
              generateId();

            if (posts.some(p => p.id === postId)) continue;

            const author = this.extractAuthor(postEl);
            const content = this.extractContent(postEl);
            const timestamp = this.extractTimestamp(postEl);
            const postUrl = this.extractPostUrl(postEl);
            const authorLink = postEl.querySelector<HTMLAnchorElement>('a[href*="/square/profile/"]');

            if (content && postUrl) {
              posts.push({
                id: postId,
                platform: 'binance',
                targetUserId: this.extractUserIdFromUrl(profileUrl),
                author,
                authorUrl: authorLink?.href || profileUrl,
                content,
                postUrl,
                timestamp,
                fetchedAt: Date.now(),
              });

              this.log(`已提取帖子: ${postId}, 内容长度: ${content.length}`);
            }
          } catch (error) {
            this.log('提取单个帖子失败:', error);
          }
        }

        if (posts.length < maxPosts) {
          await this.scrollToLoadMore(postsContainer);
          attempts++;
          await sleep(randomInt(1000, 2000));
        } else {
          break;
        }
      }

      if (posts.length === 0) {
        return { success: false, error: '未解析到任何帖子，请开启调试模式查看选择器日志' };
      }

      this.log(`共获取 ${posts.length} 条帖子`);
      return { success: true, posts };

    } catch (error) {
      this.log('获取帖子失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async openPost(postUrl: string): Promise<boolean> {
    this.log(`打开帖子: ${postUrl}`);
    try {
      const target = new URL(postUrl, window.location.href);
      if (window.location.pathname !== target.pathname) {
        window.location.href = postUrl;
        await sleep(randomInt(2000, 3500));
      } else {
        await sleep(randomInt(500, 1000));
      }

      const postContent = await this.waitForElement('postContent', 20000);
      return postContent !== null;
    } catch (error) {
      this.log('打开帖子失败:', error);
      return false;
    }
  }

  async postReply(postUrl: string, replyText: string): Promise<PostReplyResult> {
    this.log(`准备回复帖子: ${postUrl}`);

    try {
      if (await this.detectBlocked()) {
        return { success: false, error: '检测到账号受限或未登录', blockedDetected: true };
      }

      const onPostPage = await this.waitForElement('postContent', 15000);
      if (!onPostPage) {
        const opened = await this.openPost(postUrl);
        if (!opened) {
          return { success: false, error: '帖子页面未加载' };
        }
      }

      await this.simulateHumanBehavior();

      const replyButton = this.findElement('replyButton');
      if (!replyButton) {
        return { success: false, error: '未找到回复按钮' };
      }

      replyButton.click();
      await sleep(randomInt(500, 1000));

      const replyInput = await this.waitForElement('replyInput', 5000);
      if (!replyInput) {
        return { success: false, error: '未找到回复输入框' };
      }

      await this.simulateHumanBehavior();
      await this.typeWithHumanLikeDelay(replyText, replyInput);
      await sleep(randomInt(500, 1000));

      const submitButton = this.findElement('submitButton');
      if (!submitButton) {
        return { success: false, error: '未找到提交按钮' };
      }

      submitButton.click();
      await sleep(randomInt(2000, 3000));

      if (await this.detectBlocked()) {
        return { success: false, error: '提交后检测到限制', blockedDetected: true };
      }

      const success = await this.verifyReplyPosted(replyText);
      if (success) {
        this.log('回复成功');
        return { success: true };
      } else {
        return { success: false, error: '无法验证回复是否成功发送' };
      }

    } catch (error) {
      this.log('发送回复失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async detectBlocked(): Promise<boolean> {
    const bodyText = document.body?.innerText || '';
    if (bodyText.includes('请登录') || (bodyText.includes('登录') && bodyText.includes('注册') && !document.querySelector('.feed-card'))) {
      return true;
    }

    const captchaSelectors = this.config.selectors.captcha || [
      '[class*="captcha"]',
      '[id*="captcha"]',
      'iframe[src*="captcha"]',
    ];

    const rateLimitSelectors = this.config.selectors.rateLimit || [
      '[class*="rate-limit"]',
      '[class*="too-many"]',
      'text*="too many"',
    ];

    const loginSelectors = this.config.selectors.loginWall || [
      '[class*="login"]',
      '[href*="login"]',
      'button:has-text("登录")',
      'button:has-text("Sign In")',
    ];

    for (const selector of [...captchaSelectors, ...rateLimitSelectors, ...loginSelectors]) {
      try {
        const element = document.querySelector(selector) as HTMLElement;
        if (element && element.offsetParent !== null) {
          this.log(`检测到限制元素: ${selector}`);
          return true;
        }
      } catch {
      }
    }

    return false;
  }

  private extractAuthor(postEl: HTMLElement): string {
    const authorEl = this.findElement('authorName', postEl);
    if (authorEl) {
      const text = this.extractTextContent(authorEl);
      if (text) return text;
    }

    const profileLink = postEl.querySelector<HTMLAnchorElement>('a[href*="/square/profile/"]');
    if (profileLink?.href) {
      const parts = profileLink.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || '未知用户';
    }

    return '未知用户';
  }

  private extractContent(postEl: HTMLElement): string {
    const contentEl = this.findElement('postContent', postEl);
    if (contentEl) return this.extractTextContent(contentEl);

    const contentSelectors = ['[class*="content"]', '[class*="text"]', 'p', 'div[class*="post"]'];
    for (const selector of contentSelectors) {
      try {
        const el = postEl.querySelector(selector);
        if (el && el.textContent && el.textContent.trim().length > 10) {
          return el.textContent.trim();
        }
      } catch {
      }
    }

    return postEl.textContent?.trim() || '';
  }

  private extractTimestamp(postEl: HTMLElement): number {
    const timeEl = this.findElement('postTime', postEl);
    if (timeEl) {
      const timeText = this.extractTextContent(timeEl);
      return this.parseTimestamp(timeText);
    }

    const timeSelectors = ['time', '[class*="time"]', '[class*="date"]'];
    for (const selector of timeSelectors) {
      try {
        const el = postEl.querySelector(selector);
        if (el) {
          const timeText = el.textContent?.trim() || el.getAttribute('datetime') || '';
          if (timeText) return this.parseTimestamp(timeText);
        }
      } catch {
      }
    }

    return Date.now();
  }

  private extractPostUrl(postEl: HTMLElement): string {
    const prefetchEl = postEl.querySelector('[data-prefetch-path]') || postEl;
    const prefetch = prefetchEl.getAttribute('data-prefetch-path');
    if (prefetch) {
      return new URL(prefetch, window.location.origin).href;
    }

    const linkEl = postEl.querySelector<HTMLAnchorElement>('a[href*="/square/post/"]');
    if (linkEl?.href) {
      return linkEl.href;
    }

    const dataId = postEl.querySelector('[data-id]')?.getAttribute('data-id') || postEl.getAttribute('data-id');
    if (dataId) {
      return `${window.location.origin}/zh-CN/square/post/${dataId}`;
    }

    return window.location.href;
  }

  private extractUserIdFromUrl(profileUrl: string): string {
    try {
      const url = new URL(profileUrl);
      const parts = url.pathname.split('/').filter(p => p);
      return parts[parts.length - 1] || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async verifyReplyPosted(replyText: string): Promise<boolean> {
    await sleep(2000);

    const mockComments = document.getElementById('mock-comments');
    if (mockComments?.textContent?.includes(replyText.substring(0, Math.min(20, replyText.length)))) {
      this.log('在 mock-comments 中找到回复');
      return true;
    }
    
    const allComments = document.querySelectorAll('[class*="comment"], [class*="reply"], #mock-comments .comment-item');
    for (const comment of Array.from(allComments)) {
      if (comment.textContent?.includes(replyText.substring(0, 20))) {
        this.log('找到已发送的回复');
        return true;
      }
    }

    return false;
  }
}
