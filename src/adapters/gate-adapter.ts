import { BasePlatformAdapter, FetchResult, PostReplyResult } from './base-adapter';
import type { Post, PlatformConfig } from '../types';
import { generateId, sleep, randomInt } from '../utils/helpers';

export class GateAdapter extends BasePlatformAdapter {
  constructor(config: PlatformConfig) {
    super('gate', config);
  }

  async fetchUserPosts(profileUrl: string, maxPosts: number): Promise<FetchResult> {
    this.log(`开始获取用户帖子: ${profileUrl}, 最多 ${maxPosts} 条`);

    try {
      await sleep(randomInt(1000, 2000));

      const postsContainer = await this.waitForElement('postsContainer', 15000);
      if (!postsContainer) {
        return { success: false, error: '未找到帖子容器 (Gate 广场)' };
      }

      const posts: Post[] = [];
      let attempts = 0;
      const maxAttempts = 5;

      while (posts.length < maxPosts && attempts < maxAttempts) {
        const postElements = postsContainer.querySelectorAll<HTMLElement>(
          this.config.selectors.postItem?.join(',') || '[class*="post"], [class*="item"]'
        );

        this.log(`当前找到 ${postElements.length} 个帖子元素`);

        for (const postEl of Array.from(postElements)) {
          if (posts.length >= maxPosts) break;

          try {
            const postId = postEl.getAttribute('data-id') || 
                          postEl.getAttribute('id') || 
                          generateId();

            if (posts.some(p => p.id === postId)) continue;

            const author = this.extractAuthor(postEl);
            const content = this.extractContent(postEl);
            const timestamp = this.extractTimestamp(postEl);
            const postUrl = this.extractPostUrl(postEl, profileUrl);

            if (content && postUrl) {
              posts.push({
                id: postId,
                platform: 'gate',
                targetUserId: this.extractUserIdFromUrl(profileUrl),
                author,
                authorUrl: profileUrl,
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
          await sleep(randomInt(1500, 2500));
        } else {
          break;
        }
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
      window.location.href = postUrl;
      await sleep(randomInt(2000, 3500));
      
      const postContent = await this.waitForElement('postContent', 10000);
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
        return { success: false, error: '检测到账号受限', blockedDetected: true };
      }

      await this.simulateHumanBehavior();

      let replyInput = this.findElement('replyInput');
      
      if (!replyInput) {
        const replyButton = this.findElement('replyButton');
        if (replyButton) {
          replyButton.click();
          await sleep(randomInt(500, 1000));
          replyInput = await this.waitForElement('replyInput', 5000);
        }
      }

      if (!replyInput) {
        const commentButton = this.findElement('commentButton');
        if (commentButton) {
          commentButton.click();
          await sleep(randomInt(500, 1000));
          replyInput = await this.waitForElement('replyInput', 5000);
        }
      }

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
      await sleep(randomInt(2000, 3500));

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
    const blockedIndicators = [
      '[class*="captcha"]',
      '[id*="captcha"]',
      'iframe[src*="captcha"]',
      '[class*="verify"]',
      '[class*="limit"]',
      'text*="验证"',
      'text*="限制"',
      'text*="verification"',
      'text*="restricted"',
    ];

    for (const indicator of blockedIndicators) {
      try {
        if (indicator.startsWith('text*=')) {
          const text = indicator.replace('text*="', '').replace('"', '');
          const bodyText = document.body.textContent || '';
          if (bodyText.toLowerCase().includes(text.toLowerCase())) {
            this.log(`检测到限制文本: ${text}`);
            return true;
          }
        } else {
          const element = document.querySelector(indicator) as HTMLElement;
          if (element && element.offsetParent !== null) {
            this.log(`检测到限制元素: ${indicator}`);
            return true;
          }
        }
      } catch {
      }
    }

    return false;
  }

  private extractAuthor(postEl: HTMLElement): string {
    const authorEl = this.findElement('authorName', postEl);
    if (authorEl) return this.extractTextContent(authorEl);

    const authorSelectors = [
      '[class*="author"]',
      '[class*="username"]',
      '[class*="user-name"]',
      '[class*="nickname"]'
    ];
    
    for (const selector of authorSelectors) {
      try {
        const el = postEl.querySelector(selector);
        if (el && el.textContent) {
          const text = el.textContent.trim();
          if (text.length > 0 && text.length < 50) {
            return text;
          }
        }
      } catch {
      }
    }

    return '未知用户';
  }

  private extractContent(postEl: HTMLElement): string {
    const contentEl = this.findElement('postContent', postEl);
    if (contentEl) return this.extractTextContent(contentEl);

    const contentSelectors = [
      '[class*="content"]',
      '[class*="text"]',
      '[class*="description"]',
      'p',
      'div[class*="body"]',
      '[class*="message"]'
    ];
    
    for (const selector of contentSelectors) {
      try {
        const el = postEl.querySelector(selector);
        if (el && el.textContent) {
          const text = el.textContent.trim();
          if (text.length > 10) {
            return text;
          }
        }
      } catch {
      }
    }

    const text = postEl.textContent?.trim() || '';
    return text.length > 10 ? text : '';
  }

  private extractTimestamp(postEl: HTMLElement): number {
    const timeEl = this.findElement('postTime', postEl);
    if (timeEl) {
      const timeText = this.extractTextContent(timeEl);
      return this.parseTimestamp(timeText);
    }

    const timeSelectors = ['time', '[class*="time"]', '[class*="date"]', '[datetime]'];
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

  private extractPostUrl(postEl: HTMLElement, baseUrl: string): string {
    const linkSelectors = [
      'a[href*="/post"]',
      'a[href*="/detail"]',
      'a[href*="/square"]'
    ];

    for (const selector of linkSelectors) {
      try {
        const linkEl = postEl.querySelector<HTMLAnchorElement>(selector);
        if (linkEl && linkEl.href) {
          return linkEl.href;
        }
      } catch {
      }
    }

    const postId = postEl.getAttribute('data-id') || postEl.getAttribute('id');
    if (postId) {
      try {
        const url = new URL(baseUrl);
        const domain = url.hostname.includes('gate.io') ? 'gate.io' : 'gate.com';
        return `https://www.${domain}/post/${postId}`;
      } catch {
        return baseUrl;
      }
    }

    return baseUrl;
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
    await sleep(2500);
    
    const commentSelectors = [
      '[class*="comment"]',
      '[class*="reply"]',
      '[class*="response"]'
    ];

    for (const selector of commentSelectors) {
      try {
        const comments = document.querySelectorAll(selector);
        for (const comment of Array.from(comments)) {
          const text = comment.textContent || '';
          const searchText = replyText.substring(0, Math.min(20, replyText.length));
          if (text.includes(searchText)) {
            this.log('找到已发送的回复');
            return true;
          }
        }
      } catch {
      }
    }

    return false;
  }
}
