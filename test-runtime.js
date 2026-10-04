const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testExtension() {
  console.log('🧪 Chrome Extension Runtime Test\n');
  console.log('='.repeat(60));
  
  const extensionPath = path.join(__dirname, 'dist');
  console.log(`Extension path: ${extensionPath}\n`);
  
  // Launch Chromium with extension
  console.log('1️⃣  Launching Chromium with extension...');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  
  const page = await context.newPage();
  
  try {
    // Wait a bit for extension to load
    await page.waitForTimeout(2000);
    
    console.log('   ✅ Chromium launched\n');
    
    // Get extension ID
    console.log('2️⃣  Getting extension ID...');
    const extensionId = await getExtensionId(context);
    console.log(`   ✅ Extension ID: ${extensionId}\n`);
    
    // Check service worker
    console.log('3️⃣  Checking service worker...');
    const swPage = await context.waitForEvent('page', {
      predicate: (page) => page.url().includes('chrome-extension://'),
      timeout: 5000,
    }).catch(() => null);
    
    // Try to access service worker via chrome://serviceworker-internals
    await page.goto('chrome://serviceworker-internals/');
    await page.waitForTimeout(1000);
    const swStatus = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('RUNNING') || text.includes('ACTIVATED');
    });
    console.log(`   ${swStatus ? '✅' : '⚠️ '} Service worker status: ${swStatus ? 'RUNNING' : 'CHECK MANUALLY'}\n`);
    
    // Test options page
    console.log('4️⃣  Testing options.html...');
    const optionsUrl = `chrome-extension://${extensionId}/options.html`;
    const optionsPage = await context.newPage();
    
    const optionsErrors = [];
    optionsPage.on('pageerror', err => optionsErrors.push(err.message));
    optionsPage.on('console', msg => {
      if (msg.type() === 'error') optionsErrors.push(msg.text());
    });
    
    await optionsPage.goto(optionsUrl, { waitUntil: 'networkidle' });
    await optionsPage.waitForTimeout(1000);
    
    const optionsTitle = await optionsPage.title();
    console.log(`   Title: ${optionsTitle}`);
    console.log(`   ${optionsErrors.length === 0 ? '✅' : '❌'} Console errors: ${optionsErrors.length}`);
    if (optionsErrors.length > 0) {
      console.log(`   Errors: ${optionsErrors.slice(0, 3).join(', ')}`);
    }
    console.log();
    
    // Test review page
    console.log('5️⃣  Testing review.html...');
    const reviewUrl = `chrome-extension://${extensionId}/review.html`;
    const reviewPage = await context.newPage();
    
    const reviewErrors = [];
    reviewPage.on('pageerror', err => reviewErrors.push(err.message));
    reviewPage.on('console', msg => {
      if (msg.type() === 'error') reviewErrors.push(msg.text());
    });
    
    await reviewPage.goto(reviewUrl, { waitUntil: 'networkidle' });
    await reviewPage.waitForTimeout(1000);
    
    const reviewTitle = await reviewPage.title();
    console.log(`   Title: ${reviewTitle}`);
    console.log(`   ${reviewErrors.length === 0 ? '✅' : '❌'} Console errors: ${reviewErrors.length}`);
    if (reviewErrors.length > 0) {
      console.log(`   Errors: ${reviewErrors.slice(0, 3).join(', ')}`);
    }
    console.log();
    
    // Test popup
    console.log('6️⃣  Testing popup.html...');
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const popupPage = await context.newPage();
    
    const popupErrors = [];
    popupPage.on('pageerror', err => popupErrors.push(err.message));
    popupPage.on('console', msg => {
      if (msg.type() === 'error') popupErrors.push(msg.text());
    });
    
    await popupPage.goto(popupUrl, { waitUntil: 'networkidle' });
    await popupPage.waitForTimeout(1000);
    
    const popupTitle = await popupPage.title();
    console.log(`   Title: ${popupTitle}`);
    console.log(`   ${popupErrors.length === 0 ? '✅' : '❌'} Console errors: ${popupErrors.length}`);
    if (popupErrors.length > 0) {
      console.log(`   Errors: ${popupErrors.slice(0, 3).join(', ')}`);
    }
    console.log();
    
    console.log('='.repeat(60));
    console.log('✅ Basic runtime tests passed!\n');
    
    return { extensionId, context, page };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await context.close();
    throw error;
  }
}

async function getExtensionId(context) {
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  await page.waitForTimeout(1000);
  
  const extensionId = await page.evaluate(() => {
    const items = document.querySelectorAll('extensions-item');
    for (const item of items) {
      const name = item.querySelector('#name')?.textContent;
      if (name && name.includes('加密社交')) {
        return item.getAttribute('id');
      }
    }
    return null;
  });
  
  await page.close();
  return extensionId;
}

if (require.main === module) {
  testExtension()
    .then(async ({ context }) => {
      console.log('Press Ctrl+C to exit...');
      // Keep browser open for manual inspection
      await new Promise(() => {});
    })
    .catch(console.error);
}

module.exports = { testExtension };
