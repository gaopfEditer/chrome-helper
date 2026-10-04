import type { Platform } from '../types';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  const years = Math.floor(months / 12);
  return `${years}年前`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function getPlatformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    binance: '币安广场',
    okx: 'OKX',
    gate: 'Gate',
  };
  return names[platform] || platform;
}

export function getPlatformColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    binance: '#F3BA2F',
    okx: '#000000',
    gate: '#17E6A1',
  };
  return colors[platform] || '#666666';
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Reject javascript:, data:, and other non-http(s) protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractUsernameFromUrl(url: string, platform: Platform): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    switch (platform) {
      case 'binance':
        if (pathParts.includes('profile')) {
          const idx = pathParts.indexOf('profile');
          return pathParts[idx + 1] || null;
        }
        return pathParts[pathParts.length - 1] || null;
      
      case 'okx':
        if (pathParts.includes('user')) {
          const idx = pathParts.indexOf('user');
          return pathParts[idx + 1] || null;
        }
        return pathParts[pathParts.length - 1] || null;
      
      case 'gate':
        if (pathParts.includes('user')) {
          const idx = pathParts.indexOf('user');
          return pathParts[idx + 1] || null;
        }
        return pathParts[pathParts.length - 1] || null;
      
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function simulateTyping(text: string, element: HTMLElement): Promise<void> {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = '';
    element.focus();
    
    for (const char of text) {
      element.value += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(randomInt(50, 150));
    }
  } else {
    element.textContent = '';
    element.focus();
    
    for (const char of text) {
      element.textContent += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomInt(50, 150));
    }
  }
}

export function scrollToElement(element: HTMLElement): void {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function waitForElement(
  selector: string,
  timeout: number = 10000,
  parent: Document | HTMLElement = document
): Promise<HTMLElement | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const element = parent.querySelector<HTMLElement>(selector);
    if (element) return element;
    await sleep(100);
  }
  
  return null;
}

export function findElementBySelectors(selectors: string[], parent: Document | HTMLElement = document): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const element = parent.querySelector<HTMLElement>(selector);
      if (element) return element;
    } catch (error) {
      console.warn(`Invalid selector: ${selector}`, error);
    }
  }
  return null;
}

export function findElementByText(text: string, tag: string = '*', parent: Document | HTMLElement = document): HTMLElement | null {
  const xpath = `//${tag}[contains(text(), '${text}')]`;
  const result = document.evaluate(xpath, parent, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue as HTMLElement | null;
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}
