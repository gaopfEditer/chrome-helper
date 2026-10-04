import { createAdapter } from '../adapters';
import type { Platform, PlatformConfig, Post } from '../types';

export function setupContentBridge(platform: Platform): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'contentPing') {
      sendResponse({ success: true, platform });
      return true;
    }
    if (message.action === 'runFetchUserPosts') {
      handleFetch(message, platform).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      });
      return true;
    }
    if (message.action === 'runPostReply') {
      handlePostReply(message, platform).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      });
      return true;
    }
    return false;
  });
}

async function handleFetch(message: any, platform: Platform) {
  const {
    platformConfig,
    profileUrl,
    maxPosts,
    skipOlderThanHours,
  } = message as {
    platformConfig: PlatformConfig;
    profileUrl: string;
    maxPosts: number;
    skipOlderThanHours?: number;
  };

  const adapter = createAdapter(platform, platformConfig);

  if (await adapter.detectBlocked()) {
    return {
      success: false,
      error: '检测到登录墙、验证码或访问限制，请先登录后再试',
      blockedDetected: true,
    };
  }

  const result = await adapter.fetchUserPosts(profileUrl, maxPosts);
  if (!result.success || !result.posts) {
    return result;
  }

  let posts = result.posts;
  if (skipOlderThanHours && skipOlderThanHours > 0) {
    const cutoff = Date.now() - skipOlderThanHours * 60 * 60 * 1000;
    posts = posts.filter(p => p.timestamp >= cutoff);
  }

  const historyResponse = await chrome.runtime.sendMessage({ action: 'getRepliedPostIds' }).catch(() => null);
  const repliedIds: Set<string> = new Set(historyResponse?.postIds || []);
  posts = posts.filter(p => !repliedIds.has(p.id));

  return { success: true, posts };
}

async function handlePostReply(message: any, platform: Platform) {
  const { platformConfig, postUrl, replyText } = message as {
    platformConfig: PlatformConfig;
    postUrl: string;
    replyText: string;
  };

  const adapter = createAdapter(platform, platformConfig);

  if (await adapter.detectBlocked()) {
    return {
      success: false,
      error: '检测到登录墙或限制，无法发送回复',
      blockedDetected: true,
    };
  }

  const result = await adapter.postReply(postUrl, replyText);
  return result;
}
