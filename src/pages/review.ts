import { StorageManager } from '../core/storage';
import type { ReplyTask, Post, GeneratedReply, Platform } from '../types';
import { generateId, getPlatformDisplayName, timeAgo, truncateText } from '../utils/helpers';

let allTasks: ReplyTask[] = [];
let currentFilter = { platform: 'all', status: 'pending' };

document.addEventListener('DOMContentLoaded', async () => {
  await loadTasks();
  setupEventListeners();
  renderTasks();
});

function setupEventListeners() {
  document.getElementById('fetchPosts')?.addEventListener('click', fetchPosts);
  document.getElementById('generateReplies')?.addEventListener('click', generateReplies);
  document.getElementById('openOptions')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('bulkApprove')?.addEventListener('click', bulkApprove);
  document.getElementById('bulkSkip')?.addEventListener('click', bulkSkip);
  document.getElementById('startSending')?.addEventListener('click', startSending);
  document.getElementById('platformFilter')?.addEventListener('change', (e) => {
    currentFilter.platform = (e.target as HTMLSelectElement).value;
    renderTasks();
  });
  document.getElementById('statusFilter')?.addEventListener('change', (e) => {
    currentFilter.status = (e.target as HTMLSelectElement).value;
    renderTasks();
  });
  document.getElementById('addManualPost')?.addEventListener('click', addManualPost);
}

async function loadTasks() {
  allTasks = await StorageManager.getReplyTasks();
  updateStats();
}

function updateStats() {
  const total = allTasks.length;
  const approved = allTasks.filter(t => t.reply.approved).length;
  const skipped = allTasks.filter(t => t.reply.skipped).length;
  const pending = allTasks.filter(t => !t.reply.approved && !t.reply.skipped).length;

  document.getElementById('totalPosts')!.textContent = total.toString();
  document.getElementById('approvedCount')!.textContent = approved.toString();
  document.getElementById('skippedCount')!.textContent = skipped.toString();
  document.getElementById('pendingCount')!.textContent = pending.toString();
}

function renderTasks() {
  const container = document.getElementById('tasksList');
  const emptyState = document.getElementById('emptyState');
  
  if (!container || !emptyState) return;

  let filtered = allTasks;

  if (currentFilter.platform !== 'all') {
    filtered = filtered.filter(t => t.post.platform === currentFilter.platform);
  }

  if (currentFilter.status !== 'all') {
    if (currentFilter.status === 'pending') {
      filtered = filtered.filter(t => !t.reply.approved && !t.reply.skipped);
    } else if (currentFilter.status === 'approved') {
      filtered = filtered.filter(t => t.reply.approved);
    } else if (currentFilter.status === 'skipped') {
      filtered = filtered.filter(t => t.reply.skipped);
    }
  }

  if (filtered.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  container.style.display = 'block';
  emptyState.style.display = 'none';

  container.innerHTML = filtered.map(task => renderTaskCard(task)).join('');

  container.querySelectorAll('.edit-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = (e.target as HTMLElement).closest('.task-card')?.getAttribute('data-id');
      if (taskId) editReply(taskId);
    });
  });

  container.querySelectorAll('.regenerate-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = (e.target as HTMLElement).closest('.task-card')?.getAttribute('data-id');
      if (taskId) regenerateReply(taskId);
    });
  });

  container.querySelectorAll('.approve-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = (e.target as HTMLElement).closest('.task-card')?.getAttribute('data-id');
      if (taskId) approveReply(taskId);
    });
  });

  container.querySelectorAll('.skip-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = (e.target as HTMLElement).closest('.task-card')?.getAttribute('data-id');
      if (taskId) skipReply(taskId);
    });
  });

  container.querySelectorAll('.reply-textarea').forEach(textarea => {
    textarea.addEventListener('input', (e) => {
      const taskId = (e.target as HTMLElement).closest('.task-card')?.getAttribute('data-id');
      const value = (e.target as HTMLTextAreaElement).value;
      if (taskId) updateReplyContent(taskId, value);
    });
  });
}

function renderTaskCard(task: ReplyTask): string {
  const statusClass = task.reply.approved ? 'approved' : task.reply.skipped ? 'skipped' : 'pending';
  const statusText = task.reply.approved ? '已批准' : task.reply.skipped ? '已跳过' : '待审核';

  return `
    <div class="task-card" data-id="${task.id}">
      <div class="task-header">
        <div class="task-meta">
          <span class="platform-badge ${task.post.platform}">${getPlatformDisplayName(task.post.platform)}</span>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
      </div>
      <div class="post-content">
        <div class="post-author">${task.post.author}</div>
        <div class="post-text">${truncateText(task.post.content, 200)}</div>
        <div class="post-time">${timeAgo(task.post.timestamp)}</div>
      </div>
      <div class="reply-section">
        <label>回复内容</label>
        <textarea class="reply-textarea" rows="3" ${task.reply.approved || task.reply.skipped ? 'disabled' : ''}>${task.reply.content}</textarea>
      </div>
      <div class="task-actions">
        ${!task.reply.approved && !task.reply.skipped ? `
          <button class="btn btn-primary btn-sm edit-reply">✏️ 编辑</button>
          <button class="btn btn-secondary btn-sm regenerate-reply">🔄 重新生成</button>
          <button class="btn btn-success btn-sm approve-reply">✅ 批准</button>
          <button class="btn btn-warning btn-sm skip-reply">⏭️ 跳过</button>
        ` : ''}
      </div>
    </div>
  `;
}

async function fetchPosts() {
  const targets = await StorageManager.getTargetUsers();
  const enabledTargets = targets.filter(t => t.enabled);

  if (enabledTargets.length === 0) {
    alert('请先在设置页面添加目标用户');
    return;
  }

  const logEl = document.getElementById('fetchLog');
  const lines: string[] = [];
  const renderLog = () => {
    if (!logEl) return;
    logEl.classList.add('visible');
    logEl.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  };

  lines.push(`开始获取，共 ${enabledTargets.length} 个目标用户…`);
  renderLog();

  let totalNew = 0;

  for (const target of enabledTargets) {
    lines.push(`⏳ 正在打开资料页：${target.username} (${getPlatformDisplayName(target.platform)})…`);
    renderLog();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'fetchPosts',
        targetUserId: target.id,
        platform: target.platform,
        profileUrl: target.profileUrl,
        maxPosts: target.maxPosts || 5,
        skipOlderThanHours: target.skipOlderThanHours,
        username: target.username,
      });

      if (response?.success) {
        const count = response.count ?? response.posts?.length ?? 0;
        totalNew += count;
        lines.pop();
        lines.push(`<span class="log-ok">✅ ${target.username}：获取 ${count} 条帖子</span>`);
      } else {
        lines.pop();
        lines.push(
          `<span class="log-err">❌ ${target.username}：${response?.error || '未知错误'}</span>`
        );
      }
    } catch (error) {
      lines.pop();
      lines.push(
        `<span class="log-err">❌ ${target.username}：${error instanceof Error ? error.message : '请求失败'}</span>`
      );
    }
    renderLog();
  }

  lines.push(`完成。本次共写入 ${totalNew} 条新帖子（已去重）。`);
  renderLog();

  await loadTasks();
  renderTasks();
}

async function generateReplies() {
  const posts = await StorageManager.getFetchedPosts();
  
  if (posts.length === 0) {
    alert('没有可生成回复的帖子');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'generateReplies',
    posts,
  });

  if (response.success && response.results) {
    const tasks = await StorageManager.getReplyTasks();
    
    for (const post of posts) {
      const result = response.results[post.id];
      if (result.success && result.reply) {
        const existingTask = tasks.find(t => t.post.id === post.id);
        if (!existingTask) {
          const newTask: ReplyTask = {
            id: generateId(),
            post,
            reply: {
              postId: post.id,
              content: result.reply,
              generatedAt: Date.now(),
              edited: false,
              approved: false,
              skipped: false,
            },
            status: 'pending',
            attempts: 0,
          };
          tasks.push(newTask);
        }
      }
    }

    await StorageManager.saveReplyTasks(tasks);
    await loadTasks();
    renderTasks();
  }
}

async function editReply(taskId: string) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

}

async function regenerateReply(taskId: string) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  const response = await chrome.runtime.sendMessage({
    action: 'generateReplies',
    posts: [task.post],
  });

  if (response.success && response.results[task.post.id]?.reply) {
    task.reply.content = response.results[task.post.id].reply;
    task.reply.edited = false;
    await StorageManager.updateReplyTask(taskId, { reply: task.reply });
    await loadTasks();
    renderTasks();
  }
}

async function approveReply(taskId: string) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  task.reply.approved = true;
  task.reply.skipped = false;
  await StorageManager.updateReplyTask(taskId, { reply: task.reply });
  await loadTasks();
  renderTasks();
}

async function skipReply(taskId: string) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  task.reply.skipped = true;
  task.reply.approved = false;
  await StorageManager.updateReplyTask(taskId, { reply: task.reply });
  await loadTasks();
  renderTasks();
}

async function updateReplyContent(taskId: string, content: string) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  task.reply.content = content;
  task.reply.edited = true;
  await StorageManager.updateReplyTask(taskId, { reply: task.reply });
}

async function bulkApprove() {
  const pending = allTasks.filter(t => !t.reply.approved && !t.reply.skipped);
  
  for (const task of pending) {
    task.reply.approved = true;
    await StorageManager.updateReplyTask(task.id, { reply: task.reply });
  }

  await loadTasks();
  renderTasks();
}

async function bulkSkip() {
  const pending = allTasks.filter(t => !t.reply.approved && !t.reply.skipped);
  
  for (const task of pending) {
    task.reply.skipped = true;
    await StorageManager.updateReplyTask(task.id, { reply: task.reply });
  }

  await loadTasks();
  renderTasks();
}

async function startSending() {
  const approved = allTasks.filter(t => t.reply.approved && t.status === 'pending');
  
  if (approved.length === 0) {
    alert('没有已批准的回复待发送');
    return;
  }

  const response = await chrome.runtime.sendMessage({ action: 'startQueue' });
  
  if (response.success) {
    alert(`开始发送 ${approved.length} 条回复`);
  } else {
    alert('启动发送队列失败: ' + response.error);
  }
}

async function addManualPost() {
  const url = (document.getElementById('manualPostUrl') as HTMLInputElement).value.trim();
  if (!url) {
    alert('请输入帖子 URL');
    return;
  }

  const platform = detectPlatform(url);
  if (!platform) {
    alert('无法识别平台，请输入有效的币安/OKX/Gate 帖子 URL');
    return;
  }

  const post: Post = {
    id: generateId(),
    platform,
    targetUserId: 'manual',
    author: '未知',
    authorUrl: url,
    content: '手动添加的帖子',
    postUrl: url,
    timestamp: Date.now(),
    fetchedAt: Date.now(),
  };

  await StorageManager.addFetchedPosts([post]);
  await loadTasks();
  renderTasks();

  (document.getElementById('manualPostUrl') as HTMLInputElement).value = '';
}

function detectPlatform(url: string): Platform | null {
  if (url.includes('binance.com')) return 'binance';
  if (url.includes('okx.com')) return 'okx';
  if (url.includes('gate.com') || url.includes('gate.io')) return 'gate';
  return null;
}
