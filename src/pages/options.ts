import { StorageManager } from '../core/storage';
import type { AppConfig, TargetUser, ReplyTemplate, Platform } from '../types';
import { generateId, getPlatformDisplayName } from '../utils/helpers';

let currentConfig: AppConfig;
let currentPlatform: Platform = 'binance';

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupEventListeners();
  populateForm();
});

async function loadConfig() {
  currentConfig = await StorageManager.getConfig();
}

function setupEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName!);
    });
  });

  document.getElementById('saveSettings')?.addEventListener('click', saveSettings);
  document.getElementById('resetSettings')?.addEventListener('click', resetSettings);
  document.getElementById('addTemplate')?.addEventListener('click', addTemplate);
  document.getElementById('addTarget')?.addEventListener('click', addTarget);
  document.getElementById('importTargets')?.addEventListener('click', importTargets);
  document.getElementById('exportTargets')?.addEventListener('click', exportTargets);
  document.getElementById('platformSelect')?.addEventListener('change', (e) => {
    currentPlatform = (e.target as HTMLSelectElement).value as Platform;
    renderSelectors();
  });
}

function switchTab(tabName: string) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(tabName);
  
  selectedBtn?.classList.add('active');
  selectedContent?.classList.add('active');

  if (tabName === 'targets') {
    renderTargets();
  } else if (tabName === 'templates') {
    renderTemplates();
  } else if (tabName === 'platforms') {
    renderSelectors();
  }
}

function populateForm() {
  (document.getElementById('llmEnabled') as HTMLInputElement).checked = currentConfig.llm.enabled;
  (document.getElementById('llmBaseUrl') as HTMLInputElement).value = currentConfig.llm.baseUrl;
  (document.getElementById('llmApiKey') as HTMLInputElement).value = currentConfig.llm.apiKey;
  (document.getElementById('llmModel') as HTMLInputElement).value = currentConfig.llm.model;
  (document.getElementById('llmSystemPrompt') as HTMLTextAreaElement).value = currentConfig.llm.systemPrompt;
  (document.getElementById('llmMaxTokens') as HTMLInputElement).value = currentConfig.llm.maxTokens.toString();
  (document.getElementById('llmTemperature') as HTMLInputElement).value = currentConfig.llm.temperature.toString();
  (document.getElementById('llmReplyLanguage') as HTMLSelectElement).value = currentConfig.llm.replyLanguage;
  (document.getElementById('llmReplyTone') as HTMLSelectElement).value = currentConfig.llm.replyTone;

  (document.getElementById('minDelay') as HTMLInputElement).value = currentConfig.antiban.minDelaySeconds.toString();
  (document.getElementById('maxDelay') as HTMLInputElement).value = currentConfig.antiban.maxDelaySeconds.toString();
  (document.getElementById('pauseAfterReplies') as HTMLInputElement).value = currentConfig.antiban.pauseAfterReplies.toString();
  (document.getElementById('pauseDuration') as HTMLInputElement).value = currentConfig.antiban.pauseDurationSeconds.toString();
  (document.getElementById('maxRepliesPerHour') as HTMLInputElement).value = currentConfig.antiban.maxRepliesPerHour.toString();
  (document.getElementById('maxRepliesPerDay') as HTMLInputElement).value = currentConfig.antiban.maxRepliesPerDay.toString();
  (document.getElementById('maxRepliesPerUserPerDay') as HTMLInputElement).value = currentConfig.antiban.maxRepliesPerUserPerDay.toString();
  (document.getElementById('activeHoursStart') as HTMLInputElement).value = currentConfig.antiban.activeHoursStart || '';
  (document.getElementById('activeHoursEnd') as HTMLInputElement).value = currentConfig.antiban.activeHoursEnd || '';
  (document.getElementById('timezone') as HTMLInputElement).value = currentConfig.antiban.timezone;
  (document.getElementById('checkReplyVariation') as HTMLInputElement).checked = currentConfig.antiban.checkReplyVariation;
  (document.getElementById('minVariationThreshold') as HTMLInputElement).value = currentConfig.antiban.minVariationThreshold.toString();
  (document.getElementById('fetchTimeoutSec') as HTMLInputElement).value = String(
    Math.round((currentConfig.fetchTimeoutMs || 45000) / 1000)
  );
  (document.getElementById('keepFetchTabOpen') as HTMLInputElement).checked = !!currentConfig.keepFetchTabOpen;

  renderTemplates();
  renderTargets();
}

function renderTemplates() {
  const container = document.getElementById('templatesList');
  if (!container) return;

  container.innerHTML = currentConfig.templates.map(template => `
    <div class="template-item" data-id="${template.id}">
      <div class="form-group">
        <input type="text" class="template-name" value="${template.name}" placeholder="模板名称">
      </div>
      <div class="form-group">
        <textarea class="template-content" rows="3" placeholder="模板内容，可用变量：{{author}}">${template.template}</textarea>
      </div>
      <div class="template-actions">
        <label>
          <input type="checkbox" class="template-enabled" ${template.enabled ? 'checked' : ''}> 启用
        </label>
        <button class="btn btn-danger btn-sm delete-template">删除</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.delete-template').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const templateItem = (e.target as HTMLElement).closest('.template-item');
      const templateId = templateItem?.getAttribute('data-id');
      if (templateId) {
        currentConfig.templates = currentConfig.templates.filter(t => t.id !== templateId);
        renderTemplates();
      }
    });
  });
}

function addTemplate() {
  const newTemplate: ReplyTemplate = {
    id: generateId(),
    name: '新模板',
    template: '',
    enabled: true,
  };
  currentConfig.templates.push(newTemplate);
  renderTemplates();
}

async function renderTargets() {
  const container = document.getElementById('targetsList');
  if (!container) return;

  const targets = await StorageManager.getTargetUsers();

  if (targets.length === 0) {
    container.innerHTML = '<p class="info">暂无目标用户，点击"添加目标用户"开始</p>';
    return;
  }

  container.innerHTML = targets.map(target => `
    <div class="target-item" data-id="${target.id}">
      <div class="form-row">
        <div class="form-group">
          <label>平台</label>
          <span class="platform-badge ${target.platform}">${getPlatformDisplayName(target.platform)}</span>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" class="target-enabled" ${target.enabled ? 'checked' : ''}> 启用
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>用户名</label>
        <input type="text" class="target-username" value="${target.username}">
      </div>
      <div class="form-group">
        <label>资料页 URL</label>
        <input type="text" class="target-url" value="${target.profileUrl}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>最多获取帖子数</label>
          <input type="number" class="target-max-posts" value="${target.maxPosts || 5}" min="1" max="50">
        </div>
        <div class="form-group">
          <label>跳过多少小时前的帖子</label>
          <input type="number" class="target-skip-hours" value="${target.skipOlderThanHours || 24}" min="1" max="168">
        </div>
      </div>
      <div class="target-actions">
        <button class="btn btn-danger btn-sm delete-target">删除</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.delete-target').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetItem = (e.target as HTMLElement).closest('.target-item');
      const targetId = targetItem?.getAttribute('data-id');
      if (targetId && confirm('确定要删除这个目标用户吗？')) {
        await StorageManager.removeTargetUser(targetId);
        await renderTargets();
      }
    });
  });
}

function addTarget() {
  const platform = prompt('选择平台 (binance/okx/gate):');
  if (!platform || !['binance', 'okx', 'gate'].includes(platform)) {
    alert('无效的平台');
    return;
  }

  const username = prompt('输入用户名:');
  const profileUrl = prompt('输入资料页 URL:');

  if (!username || !profileUrl) {
    alert('用户名和 URL 不能为空');
    return;
  }

  const newTarget: TargetUser = {
    id: generateId(),
    platform: platform as Platform,
    username,
    profileUrl,
    maxPosts: 5,
    skipOlderThanHours: 24,
    enabled: true,
  };

  StorageManager.addTargetUser(newTarget).then(() => {
    renderTargets();
    showStatus('目标用户已添加', 'success');
  });
}

async function importTargets() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const targets = data.targetUsers || data;
        
        if (!Array.isArray(targets)) {
          throw new Error('无效的 JSON 格式');
        }

        await StorageManager.saveTargetUsers(targets);
        await renderTargets();
        showStatus('目标用户导入成功', 'success');
      } catch (error) {
        showStatus('导入失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function exportTargets() {
  const targets = await StorageManager.getTargetUsers();
  const dataStr = JSON.stringify({ targetUsers: targets }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `targets_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('目标用户导出成功', 'success');
}

function renderSelectors() {
  const container = document.getElementById('selectorsList');
  if (!container) return;

  const platformConfig = currentConfig.platforms[currentPlatform];
  const debugModeCheckbox = document.getElementById('debugMode') as HTMLInputElement;
  debugModeCheckbox.checked = platformConfig.debugMode;

  debugModeCheckbox.onchange = () => {
    platformConfig.debugMode = debugModeCheckbox.checked;
  };

  const selectors = platformConfig.selectors;

  container.innerHTML = Object.keys(selectors).map(key => `
    <div class="selector-item">
      <label>${key}</label>
      <textarea class="selector-input" data-key="${key}">${selectors[key].join('\n')}</textarea>
    </div>
  `).join('');
}

async function saveSettings() {
  try {
    currentConfig.llm.enabled = (document.getElementById('llmEnabled') as HTMLInputElement).checked;
    currentConfig.llm.baseUrl = (document.getElementById('llmBaseUrl') as HTMLInputElement).value;
    currentConfig.llm.apiKey = (document.getElementById('llmApiKey') as HTMLInputElement).value;
    currentConfig.llm.model = (document.getElementById('llmModel') as HTMLInputElement).value;
    currentConfig.llm.systemPrompt = (document.getElementById('llmSystemPrompt') as HTMLTextAreaElement).value;
    currentConfig.llm.maxTokens = parseInt((document.getElementById('llmMaxTokens') as HTMLInputElement).value);
    currentConfig.llm.temperature = parseFloat((document.getElementById('llmTemperature') as HTMLInputElement).value);
    currentConfig.llm.replyLanguage = (document.getElementById('llmReplyLanguage') as HTMLSelectElement).value;
    currentConfig.llm.replyTone = (document.getElementById('llmReplyTone') as HTMLSelectElement).value;

    currentConfig.antiban.minDelaySeconds = parseInt((document.getElementById('minDelay') as HTMLInputElement).value);
    currentConfig.antiban.maxDelaySeconds = parseInt((document.getElementById('maxDelay') as HTMLInputElement).value);
    currentConfig.antiban.pauseAfterReplies = parseInt((document.getElementById('pauseAfterReplies') as HTMLInputElement).value);
    currentConfig.antiban.pauseDurationSeconds = parseInt((document.getElementById('pauseDuration') as HTMLInputElement).value);
    currentConfig.antiban.maxRepliesPerHour = parseInt((document.getElementById('maxRepliesPerHour') as HTMLInputElement).value);
    currentConfig.antiban.maxRepliesPerDay = parseInt((document.getElementById('maxRepliesPerDay') as HTMLInputElement).value);
    currentConfig.antiban.maxRepliesPerUserPerDay = parseInt((document.getElementById('maxRepliesPerUserPerDay') as HTMLInputElement).value);
    currentConfig.antiban.activeHoursStart = (document.getElementById('activeHoursStart') as HTMLInputElement).value;
    currentConfig.antiban.activeHoursEnd = (document.getElementById('activeHoursEnd') as HTMLInputElement).value;
    currentConfig.antiban.timezone = (document.getElementById('timezone') as HTMLInputElement).value;
    currentConfig.antiban.checkReplyVariation = (document.getElementById('checkReplyVariation') as HTMLInputElement).checked;
    currentConfig.antiban.minVariationThreshold = parseFloat((document.getElementById('minVariationThreshold') as HTMLInputElement).value);
    currentConfig.fetchTimeoutMs =
      parseInt((document.getElementById('fetchTimeoutSec') as HTMLInputElement).value, 10) * 1000;
    currentConfig.keepFetchTabOpen = (document.getElementById('keepFetchTabOpen') as HTMLInputElement).checked;

    document.querySelectorAll('.template-item').forEach(item => {
      const id = item.getAttribute('data-id')!;
      const template = currentConfig.templates.find(t => t.id === id);
      if (template) {
        template.name = (item.querySelector('.template-name') as HTMLInputElement).value;
        template.template = (item.querySelector('.template-content') as HTMLTextAreaElement).value;
        template.enabled = (item.querySelector('.template-enabled') as HTMLInputElement).checked;
      }
    });

    document.querySelectorAll('.selector-input').forEach(input => {
      const key = (input as HTMLTextAreaElement).getAttribute('data-key')!;
      const value = (input as HTMLTextAreaElement).value;
      currentConfig.platforms[currentPlatform].selectors[key] = value.split('\n').filter(s => s.trim());
    });

    const targets = await StorageManager.getTargetUsers();
    document.querySelectorAll('.target-item').forEach(item => {
      const id = item.getAttribute('data-id')!;
      const target = targets.find(t => t.id === id);
      if (target) {
        target.username = (item.querySelector('.target-username') as HTMLInputElement).value;
        target.profileUrl = (item.querySelector('.target-url') as HTMLInputElement).value;
        target.maxPosts = parseInt((item.querySelector('.target-max-posts') as HTMLInputElement).value);
        target.skipOlderThanHours = parseInt((item.querySelector('.target-skip-hours') as HTMLInputElement).value);
        target.enabled = (item.querySelector('.target-enabled') as HTMLInputElement).checked;
      }
    });
    await StorageManager.saveTargetUsers(targets);

    await StorageManager.saveConfig(currentConfig);

    await chrome.runtime.sendMessage({ action: 'updateConfig', config: currentConfig });

    showStatus('设置已保存', 'success');
  } catch (error) {
    showStatus('保存失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
  }
}

async function resetSettings() {
  if (!confirm('确定要重置所有设置为默认值吗？')) {
    return;
  }

  currentConfig = StorageManager.getDefaultConfig();
  await StorageManager.saveConfig(currentConfig);
  populateForm();
  showStatus('设置已重置', 'success');
}

function showStatus(message: string, type: 'success' | 'error') {
  const statusEl = document.getElementById('statusMessage');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = type;

  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 3000);
}
