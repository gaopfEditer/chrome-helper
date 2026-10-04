import type { Platform } from '../types';

const CONTENT_PING_ACTION = 'contentPing';

export function waitForTabStatusComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`标签页在 ${timeoutMs / 1000}s 内未完成加载`));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tab.status === 'complete') {
        clearTimeout(timer);
        resolve();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

export async function waitForContentScript(
  tabId: number,
  platform: Platform,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';

  while (Date.now() < deadline) {
    const response = await sendTabMessage<{ success?: boolean; platform?: string }>(
      tabId,
      { action: CONTENT_PING_ACTION },
      3000
    ).catch(err => {
      lastError = err instanceof Error ? err.message : String(err);
      return null;
    });

    if (response?.success && response.platform === platform) {
      return;
    }

    await delay(500);
  }

  throw new Error(
    lastError
      ? `内容脚本未就绪: ${lastError}`
      : '内容脚本未就绪（请确认 URL 匹配扩展的 content_scripts）'
  );
}

export function sendTabMessage<T>(
  tabId: number,
  message: Record<string, unknown>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`页面消息超时 (${timeoutMs}ms): ${message.action}`));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, response => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

export async function runInPlatformTab<T>(options: {
  url: string;
  platform: Platform;
  loadTimeoutMs: number;
  messageTimeoutMs: number;
  keepTabOpen: boolean;
  buildMessage: () => Record<string, unknown>;
}): Promise<{ result: T; tabId: number }> {
  const tab = await chrome.tabs.create({ url: options.url, active: false });
  if (!tab.id) {
    throw new Error('无法创建标签页');
  }

  const tabId = tab.id;

  try {
    await waitForTabStatusComplete(tabId, options.loadTimeoutMs);
    await delay(1500);
    await waitForContentScript(tabId, options.platform, Math.min(options.messageTimeoutMs, 30000));

    const result = await sendTabMessage<T>(
      tabId,
      options.buildMessage(),
      options.messageTimeoutMs
    );

    if (!options.keepTabOpen) {
      await chrome.tabs.remove(tabId).catch(() => undefined);
    }

    return { result, tabId };
  } catch (error) {
    if (!options.keepTabOpen) {
      await chrome.tabs.remove(tabId).catch(() => undefined);
    }
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
