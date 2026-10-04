const { chromium } = require('playwright');
const path = require('path');

async function getExtensionId(context) {
  for (let i = 0; i < 20; i++) {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const { targetInfos } = await cdp.send('Target.getTargets');
    await page.close();
    for (const t of targetInfos) {
      if (t.url?.startsWith('chrome-extension://')) {
        return new URL(t.url).hostname;
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('extension not found');
}

(async () => {
  const extPath = path.resolve(__dirname, '../dist');
  const context = await chromium.launchPersistentContext('/tmp/ext-runtime-test', {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-sandbox'],
  });
  try {
    const id = await getExtensionId(context);
    console.log('Extension ID:', id);
    for (const pageName of ['options.html', 'review.html', 'popup.html']) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`chrome-extension://${id}/${pageName}`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log(pageName, 'title:', await page.title(), 'errors:', errors.length);
      if (errors.length) console.log(' ', errors.slice(0, 3));
      await page.close();
    }
    console.log('Runtime UI check OK');
  } finally {
    await context.close();
  }
})();
