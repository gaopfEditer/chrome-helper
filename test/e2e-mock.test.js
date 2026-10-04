/**
 * End-to-end test: extension loaded in Chromium, mock Binance pages on :8765
 */
const path = require('path');
const { chromium } = require('playwright');
const mockServer = require('./mock-server');

const EXT_PATH = path.resolve(__dirname, '../dist');
const MOCK_SELECTORS = {
  replyButton: ['#mock-reply-btn', 'button.bn-button__primary'],
  replyInput: ['#mock-reply-input', 'textarea'],
  submitButton: ['#mock-submit-btn'],
};

async function getExtensionId(context) {
  for (let i = 0; i < 20; i++) {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const { targetInfos } = await cdp.send('Target.getTargets');
    await page.close();
    for (const t of targetInfos) {
      if (t.url && t.url.startsWith('chrome-extension://')) {
        const id = new URL(t.url).hostname;
        if (id && id.length >= 16) return id;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Extension not loaded (no chrome-extension:// target found)');
}

async function setMockConfig(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForTimeout(1500);
  await page.evaluate((selectors) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['config'], (result) => {
        const config = result.config || {};
        config.fetchTimeoutMs = 45000;
        config.keepFetchTabOpen = false;
        config.platforms = config.platforms || {};
        config.platforms.binance = config.platforms.binance || { platform: 'binance', selectors: {}, debugMode: true };
        config.platforms.binance.selectors = {
          ...config.platforms.binance.selectors,
          ...selectors,
        };
        chrome.storage.local.set({ config }, () => resolve());
      });
    });
  }, MOCK_SELECTORS);
  await page.close();
}

async function run() {
  console.log('E2E: starting mock server…');
  const { server, port } = await mockServer.startMockServer();

  const profileUrl = `http://127.0.0.1:${port}/mock-binance-profile.html`;
  const postUrl = `http://127.0.0.1:${port}/mock-binance-post.html?id=mock-post-001`;

  const userDataDir = path.join(__dirname, '../.tmp-e2e-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const extensionId = await getExtensionId(context);
    console.log('E2E: extension id', extensionId);
    await setMockConfig(context, extensionId);

    const bgPage = await context.newPage();
    await bgPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await bgPage.waitForTimeout(1000);

    const fetchResult = await bgPage.evaluate(async ({ profileUrl }) => {
      return chrome.runtime.sendMessage({
        action: 'fetchPosts',
        targetUserId: 'mock-user',
        platform: 'binance',
        profileUrl,
        maxPosts: 2,
        skipOlderThanHours: 168,
        username: 'mock',
      });
    }, { profileUrl });

    if (!fetchResult?.success || !fetchResult.posts?.length) {
      throw new Error('Fetch failed: ' + JSON.stringify(fetchResult));
    }
    console.log('E2E: fetch OK, posts=', fetchResult.posts.length);

    const replyText = 'E2E mock reply ' + Date.now();
    const taskId = 'e2e-task-' + Date.now();
    await bgPage.evaluate(async ({ taskId, postUrl, replyText, post }) => {
      const tasks = [{
        id: taskId,
        post,
        reply: {
          postId: post.id,
          content: replyText,
          generatedAt: Date.now(),
          edited: false,
          approved: true,
          skipped: false,
        },
        status: 'pending',
        attempts: 0,
      }];
      await chrome.storage.local.set({ replyTasks: tasks });
    }, {
      taskId,
      postUrl,
      replyText,
      post: fetchResult.posts[0],
    });

    const execResult = await bgPage.evaluate(async ({ taskId }) => {
      return chrome.runtime.sendMessage({ action: 'executeReply', taskId });
    }, { taskId });

    if (!execResult?.success) {
      throw new Error('executeReply failed: ' + JSON.stringify(execResult));
    }

    const tasksAfter = await bgPage.evaluate(async ({ taskId }) => {
      const r = await chrome.storage.local.get('replyTasks');
      return r.replyTasks?.find((t) => t.id === taskId);
    }, { taskId });

    if (tasksAfter?.status !== 'sent') {
      throw new Error('Task not marked sent: ' + JSON.stringify(tasksAfter));
    }
    console.log('E2E: reply sent OK');

    const failTaskId = 'e2e-fail-' + Date.now();
    await bgPage.evaluate(async ({ failTaskId, postUrl, port }) => {
      const tasks = (await chrome.storage.local.get('replyTasks')).replyTasks || [];
      tasks.push({
        id: failTaskId,
        post: {
          id: 'bad-post',
          platform: 'binance',
          targetUserId: 'x',
          author: 'x',
          authorUrl: postUrl,
          content: 'x',
          postUrl: `http://127.0.0.1:${port}/not-found.html`,
          timestamp: Date.now(),
          fetchedAt: Date.now(),
        },
        reply: {
          postId: 'bad-post',
          content: 'should fail',
          generatedAt: Date.now(),
          edited: false,
          approved: true,
          skipped: false,
        },
        status: 'pending',
        attempts: 0,
      });
      await chrome.storage.local.set({ replyTasks: tasks });
    }, { failTaskId, postUrl, port });

    const failResult = await bgPage.evaluate(async ({ failTaskId }) => {
      return chrome.runtime.sendMessage({ action: 'executeReply', taskId: failTaskId });
    }, { failTaskId });

    if (failResult?.success) {
      throw new Error('Expected failure but got success');
    }

    const failTask = await bgPage.evaluate(async ({ failTaskId }) => {
      const r = await chrome.storage.local.get('replyTasks');
      return r.replyTasks?.find((t) => t.id === failTaskId);
    }, { failTaskId });

    if (failTask?.status !== 'failed') {
      throw new Error('Failure case not marked failed: ' + JSON.stringify(failTask));
    }
    console.log('E2E: failure case OK');

    await bgPage.close();
    console.log('E2E: all passed');
  } finally {
    await context.close();
    server.close();
  }
}

run().catch(err => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
