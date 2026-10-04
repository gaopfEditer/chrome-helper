import type { Post, Platform, PlatformConfig } from '../types';
import { findElementBySelectors, waitForElement, scrollToElement, simulateTyping, sleep, randomInt } from '../utils/helpers';

export interface FetchResult {
  success: boolean;
  posts?: Post[];
  error?: string;
  blockedDetected?: boolean;
}

export interface PostReplyResult {
  success: boolean;
  error?: string;
  blockedDetected?: boolean;
}

export abstract class BasePlatformAdapter {
  protected platform: Platform;
  protected config: PlatformConfig;

  constructor(platform: Platform, config: PlatformConfig) {
    this.platform = platform;
    this.config = config;
  }

  updateConfig(config: PlatformConfig): void {
    this.config = config;
  }

  abstract fetchUserPosts(profileUrl: string, maxPosts: number): Promise<FetchResult>;
  
  abstract openPost(postUrl: string): Promise<boolean>;
  
  abstract postReply(postUrl: string, replyText: string): Promise<PostReplyResult>;
  
  abstract detectBlocked(): Promise<boolean>;

  protected log(...args: any[]): void {
    if (this.config.debugMode) {
      console.log(`[${this.platform.toUpperCase()} Adapter]`, ...args);
    }
  }

  protected findElement(selectorKey: string, parent?: Document | HTMLElement): HTMLElement | null {
    const selectors = this.config.selectors[selectorKey];
    if (!selectors || selectors.length === 0) {
      this.log(`No selectors defined for key: ${selectorKey}`);
      return null;
    }

    const element = findElementBySelectors(selectors, parent);
    if (element) {
      this.log(`Found element for ${selectorKey} using selector:`, selectors);
    } else {
      this.log(`Element not found for ${selectorKey}, tried:`, selectors);
    }
    
    return element;
  }

  protected async waitForElement(selectorKey: string, timeout: number = 10000): Promise<HTMLElement | null> {
    const selectors = this.config.selectors[selectorKey];
    if (!selectors || selectors.length === 0) {
      this.log(`No selectors defined for key: ${selectorKey}`);
      return null;
    }

    for (const selector of selectors) {
      try {
        const element = await waitForElement(selector, timeout);
        if (element) {
          this.log(`Found element for ${selectorKey} using selector:`, selector);
          return element;
        }
      } catch (error) {
        this.log(`Error waiting for selector ${selector}:`, error);
      }
    }

    this.log(`Element not found for ${selectorKey} after ${timeout}ms`);
    return null;
  }

  protected async simulateHumanBehavior(): Promise<void> {
    await sleep(randomInt(500, 1500));
    window.scrollBy(0, randomInt(-100, 100));
    await sleep(randomInt(200, 600));
  }

  protected async typeWithHumanLikeDelay(text: string, element: HTMLElement): Promise<void> {
    await simulateTyping(text, element);
  }

  protected extractTextContent(element: HTMLElement): string {
    return element.textContent?.trim() || '';
  }

  protected parseTimestamp(timeText: string): number {
    const now = Date.now();
    
    const minutesMatch = timeText.match(/(\d+)\s*分钟/);
    if (minutesMatch) {
      return now - parseInt(minutesMatch[1]) * 60 * 1000;
    }
    
    const hoursMatch = timeText.match(/(\d+)\s*小时/);
    if (hoursMatch) {
      return now - parseInt(hoursMatch[1]) * 60 * 60 * 1000;
    }
    
    const daysMatch = timeText.match(/(\d+)\s*天/);
    if (daysMatch) {
      return now - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000;
    }

    const minutesMatchEn = timeText.match(/(\d+)\s*(min|minute)/i);
    if (minutesMatchEn) {
      return now - parseInt(minutesMatchEn[1]) * 60 * 1000;
    }
    
    const hoursMatchEn = timeText.match(/(\d+)\s*(h|hour)/i);
    if (hoursMatchEn) {
      return now - parseInt(hoursMatchEn[1]) * 60 * 60 * 1000;
    }
    
    const daysMatchEn = timeText.match(/(\d+)\s*(d|day)/i);
    if (daysMatchEn) {
      return now - parseInt(daysMatchEn[1]) * 24 * 60 * 60 * 1000;
    }

    try {
      const date = new Date(timeText);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    } catch {
    }

    return now;
  }

  protected async scrollToLoadMore(container?: HTMLElement): Promise<void> {
    const target = container || document.documentElement;
    const scrollHeight = target.scrollHeight;
    
    target.scrollTo({
      top: scrollHeight,
      behavior: 'smooth',
    });
    
    await sleep(randomInt(1000, 2000));
  }
}
