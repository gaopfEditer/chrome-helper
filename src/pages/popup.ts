document.addEventListener('DOMContentLoaded', async () => {
  await updateStatus();
  setupEventListeners();
  
  setInterval(updateStatus, 5000);
});

function setupEventListeners() {
  document.getElementById('openReview')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
  });

  document.getElementById('openOptions')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('startQueue')?.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'startQueue' });
    if (response.success) {
      await updateStatus();
    } else {
      alert('启动失败: ' + response.error);
    }
  });

  document.getElementById('pauseQueue')?.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'pauseQueue' });
    if (response.success) {
      await updateStatus();
    }
  });

  document.getElementById('stopQueue')?.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'stopQueue' });
    if (response.success) {
      await updateStatus();
    }
  });
}

async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getQueueStats' });
    
    if (response.success && response.stats) {
      const stats = response.stats;
      
      let statusText = '已停止';
      if (stats.isRunning) {
        statusText = stats.isPaused ? '⏸️ 已暂停' : '▶️ 运行中';
      }
      
      document.getElementById('queueStatus')!.textContent = statusText;
      document.getElementById('pendingCount')!.textContent = stats.pending.toString();
      document.getElementById('sentToday')!.textContent = stats.repliesInLastDay.toString();
    }
  } catch (error) {
    console.error('更新状态失败:', error);
  }
}
