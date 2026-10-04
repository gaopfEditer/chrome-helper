import { StorageManager } from '../core/storage';
import { QueueManager } from '../core/queue';
import { LLMClient } from '../core/llm-client';
import { runInPlatformTab } from './tab-messaging';
import { DEFAULT_PLATFORM_SELECTORS } from '../adapters';
import type { Platform, Post } from '../types';

let queueManager: QueueManager | null = null;
let llmClient: LLMClient | null = null;

async function initializeManagers() {
  const config = await StorageManager.getConfig();
  
  if (!queueManager) {
    queueManager = new QueueManager(config.antiban);
  }
  
  if (!llmClient) {
    llmClient = new LLMClient(config.llm);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('扩展已安装');
  
  const config = await StorageManager.getConfig();
  if (!config.llm) {
    await StorageManager.saveConfig(StorageManager.getDefaultConfig());
  }

  await initializePlatformConfigs(details.reason === 'update');
  
  chrome.alarms.create('cleanupOldData', { periodInMinutes: 24 * 60 });
});

async function initializePlatformConfigs(isUpdate: boolean) {
  const config = await StorageManager.getConfig();
  
  for (const [platform, selectors] of Object.entries(DEFAULT_PLATFORM_SELECTORS)) {
    const key = platform as keyof typeof config.platforms;
    if (!config.platforms[key].selectors || 
        Object.keys(config.platforms[key].selectors).length === 0) {
      config.platforms[key].selectors = selectors;
    }
  }

  if (isUpdate) {
    config.platforms.binance.selectors = DEFAULT_PLATFORM_SELECTORS.binance;
  }

  if (config.fetchTimeoutMs == null) {
    config.fetchTimeoutMs = 45000;
  }
  if (config.keepFetchTabOpen == null) {
    config.keepFetchTabOpen = false;
  }
  
  await StorageManager.saveConfig(config);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(error => {
    console.error('消息处理错误:', error);
    sendResponse({ success: false, error: error.message });
  });
  return true;
});

async function handleMessage(message: any, sender: chrome.runtime.MessageSender) {
  const { action } = message;

  switch (action) {
    case 'fetchPosts':
      return await handleFetchPosts(message);
    
    case 'generateReplies':
      return await handleGenerateReplies(message);
    
    case 'startQueue':
      return await handleStartQueue();
    
    case 'pauseQueue':
      return await handlePauseQueue();
    
    case 'resumeQueue':
      return await handleResumeQueue();
    
    case 'stopQueue':
      return await handleStopQueue();
    
    case 'getQueueStats':
      return await handleGetQueueStats();
    
    case 'executeReply':
      return await handleExecuteReply(message);
    
    case 'getRepliedPostIds':
      return await handleGetRepliedPostIds();
    
    case 'updateConfig':
      return await handleUpdateConfig(message);
    
    default:
      return { success: false, error: '未知操作' };
  }
}

async function handleGetRepliedPostIds() {
  const history = await StorageManager.getRepliedHistory();
  return { success: true, postIds: history.map(h => h.postId) };
}

async function handleFetchPosts(message: any) {
  const { targetUserId, platform, profileUrl, maxPosts, skipOlderThanHours } = message;
  
  try {
    const config = await StorageManager.getConfig();
    const platformKey = platform as Platform;
    const platformConfig = config.platforms[platformKey];
    const timeoutMs = config.fetchTimeoutMs || 45000;

    const { result } = await runInPlatformTab<{
      success: boolean;
      posts?: Post[];
      error?: string;
      blockedDetected?: boolean;
    }>({
      url: profileUrl,
      platform: platformKey,
      loadTimeoutMs: timeoutMs,
      messageTimeoutMs: timeoutMs,
      keepTabOpen: !!config.keepFetchTabOpen,
      buildMessage: () => ({
        action: 'runFetchUserPosts',
        platformConfig,
        profileUrl,
        maxPosts: maxPosts || config.defaultPostsPerUser,
        skipOlderThanHours: skipOlderThanHours ?? config.defaultSkipOlderThanHours,
      }),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || '获取帖子失败',
        blockedDetected: result.blockedDetected,
        targetUserId,
        username: message.username,
      };
    }

    const posts = result.posts || [];
    if (posts.length > 0) {
      await StorageManager.addFetchedPosts(posts);
    }

    return {
      success: true,
      posts,
      count: posts.length,
      targetUserId,
      username: message.username,
    };
  } catch (error) {
    console.error('获取帖子失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      targetUserId,
      username: message.username,
    };
  }
}

async function handleGenerateReplies(message: any) {
  const { posts } = message as { posts: Post[] };
  
  try {
    await initializeManagers();
    
    if (!llmClient) {
      return { success: false, error: 'LLM 客户端未初始化' };
    }

    const config = await StorageManager.getConfig();
    llmClient.updateConfig(config.llm);

    const results: { [postId: string]: { success: boolean; reply?: string; error?: string } } = {};

    for (const post of posts) {
      const hasReplied = await StorageManager.hasRepliedToPost(post.id);
      if (hasReplied) {
        results[post.id] = { success: false, error: '已回复过此帖子' };
        continue;
      }

      if (config.llm.enabled) {
        const response = await llmClient.generateReply(post);
        results[post.id] = response;
      } else {
        const template = config.templates.find(t => t.enabled);
        if (template) {
          const reply = template.template.replace('{{author}}', post.author);
          results[post.id] = { success: true, reply };
        } else {
          results[post.id] = { success: false, error: '无可用的回复模板' };
        }
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error('生成回复失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handleStartQueue() {
  try {
    await initializeManagers();
    
    if (!queueManager) {
      return { success: false, error: '队列管理器未初始化' };
    }

    await queueManager.start();
    return { success: true };
  } catch (error) {
    console.error('启动队列失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handlePauseQueue() {
  try {
    if (!queueManager) {
      return { success: false, error: '队列管理器未初始化' };
    }

    await queueManager.pause();
    return { success: true };
  } catch (error) {
    console.error('暂停队列失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handleResumeQueue() {
  try {
    if (!queueManager) {
      await initializeManagers();
    }

    if (!queueManager) {
      return { success: false, error: '队列管理器未初始化' };
    }

    await queueManager.resume();
    return { success: true };
  } catch (error) {
    console.error('恢复队列失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handleStopQueue() {
  try {
    if (!queueManager) {
      return { success: false, error: '队列管理器未初始化' };
    }

    await queueManager.stop();
    return { success: true };
  } catch (error) {
    console.error('停止队列失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handleGetQueueStats() {
  try {
    if (!queueManager) {
      await initializeManagers();
    }

    if (!queueManager) {
      return { success: false, error: '队列管理器未初始化' };
    }

    const stats = await queueManager.getStats();
    return { success: true, stats };
  } catch (error) {
    console.error('获取队列状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handleExecuteReply(message: any) {
  const { taskId } = message;
  
  try {
    const tasks = await StorageManager.getReplyTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    const config = await StorageManager.getConfig();
    const platformConfig = config.platforms[task.post.platform];
    const timeoutMs = config.fetchTimeoutMs || 45000;

    const { result } = await runInPlatformTab<{
      success: boolean;
      error?: string;
      blockedDetected?: boolean;
    }>({
      url: task.post.postUrl,
      platform: task.post.platform,
      loadTimeoutMs: timeoutMs,
      messageTimeoutMs: timeoutMs,
      keepTabOpen: !!config.keepFetchTabOpen,
      buildMessage: () => ({
        action: 'runPostReply',
        platformConfig,
        postUrl: task.post.postUrl,
        replyText: task.reply.content,
      }),
    });

    if (!result.success) {
      await StorageManager.updateReplyTask(taskId, {
        status: 'failed',
        error: result.error || '发送失败',
      });

      if (result.blockedDetected && queueManager) {
        await queueManager.stop();
      }

      return {
        success: false,
        error: result.error || '发送失败',
        blockedDetected: result.blockedDetected,
      };
    }

    await StorageManager.updateReplyTask(taskId, {
      status: 'sent',
      sentAt: Date.now(),
      error: undefined,
    });

    await StorageManager.addToRepliedHistory({
      postId: task.post.id,
      platform: task.post.platform,
      repliedAt: Date.now(),
      replyContent: task.reply.content,
    });

    return { success: true };
  } catch (error) {
    console.error('执行回复失败:', error);
    
    await StorageManager.updateReplyTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : '未知错误',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function handleUpdateConfig(message: any) {
  const { config } = message;
  
  try {
    await StorageManager.saveConfig(config);
    
    if (llmClient) {
      llmClient.updateConfig(config.llm);
    }
    
    if (queueManager) {
      await queueManager.updateConfig(config.antiban);
    }

    return { success: true };
  } catch (error) {
    console.error('更新配置失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanupOldData') {
    await StorageManager.clearOldData();
  } else if (queueManager) {
    await queueManager.handleAlarm(alarm);
  }
});

console.log('加密社交回复助手 Service Worker 已启动');
