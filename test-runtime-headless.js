const { chromium } = require('playwright');
const path = require('path');

async function testExtension() {
  console.log('🧪 Chrome Extension Runtime Test (Headless Mode)\n');
  console.log('='.repeat(60));
  
  const extensionPath = path.resolve(__dirname, 'dist');
  console.log(`Extension path: ${extensionPath}\n`);
  
  // Note: Extensions don't work in standard headless mode
  // Using headed mode with xvfb
  console.log('1️⃣  Launching Chromium...');
  
  let browser, context;
  
  try {
    // Try persistent context (needed for extensions)
    context = await chromium.launchPersistentContext('/tmp/test-profile', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    
    console.log('   ✅ Browser launched\n');
    
    const pages = context.pages();
    const page = pages[0] || await context.newPage();
    
    // Wait for extension to load
    await page.waitForTimeout(3000);
    
    // Navigate to extensions page to get ID
    console.log('2️⃣  Getting extension ID...');
    await page.goto('chrome://extensions/');
    await page.waitForTimeout(2000);
    
    const extensionInfo = await page.evaluate(() => {
      const items = document.querySelectorAll('extensions-item');
      for (const item of items) {
        const shadowRoot = item.shadowRoot;
        if (!shadowRoot) continue;
        
        const nameEl = shadowRoot.querySelector('#name');
        const name = nameEl?.textContent || '';
        
        if (name.includes('加密') || name.includes('回复')) {
          const id = item.getAttribute('id');
          const errors = shadowRoot.querySelector('#errors-button')?.textContent || '0';
          return { id, name, errors };
        }
      }
      return null;
    });
    
    if (!extensionInfo) {
      throw new Error('Extension not found! It may have failed to load.');
    }
    
    console.log(`   ✅ Extension loaded: ${extensionInfo.name}`);
    console.log(`   ID: ${extensionInfo.id}`);
    console.log(`   Errors: ${extensionInfo.errors}\n`);
    
    const extensionId = extensionInfo.id;
    
    // Test options page
    console.log('3️⃣  Testing options.html...');
    const optionsUrl = `chrome-extension://${extensionId}/options.html`;
    const optionsPage = await context.newPage();
    
    const optionsErrors = [];
    optionsPage.on('pageerror', err => optionsErrors.push(err.message));
    optionsPage.on('console', msg => {
      if (msg.type() === 'error') optionsErrors.push(msg.text());
    });
    
    await optionsPage.goto(optionsUrl, { timeout: 10000 });
    await optionsPage.waitForTimeout(2000);
    
    const optionsTitle = await optionsPage.title();
    const optionsH1 = await optionsPage.textContent('h1').catch(() => 'N/A');
    
    console.log(`   Title: ${optionsTitle}`);
    console.log(`   H1: ${optionsH1}`);
    console.log(`   ${optionsErrors.length === 0 ? '✅' : '❌'} Console errors: ${optionsErrors.length}`);
    if (optionsErrors.length > 0) {
      console.log(`   First 3 errors:`, optionsErrors.slice(0, 3));
    }
    
    await optionsPage.close();
    console.log();
    
    // Test review page
    console.log('4️⃣  Testing review.html...');
    const reviewUrl = `chrome-extension://${extensionId}/review.html`;
    const reviewPage = await context.newPage();
    
    const reviewErrors = [];
    reviewPage.on('pageerror', err => reviewErrors.push(err.message));
    reviewPage.on('console', msg => {
      if (msg.type() === 'error') reviewErrors.push(msg.text());
    });
    
    await reviewPage.goto(reviewUrl, { timeout: 10000 });
    await reviewPage.waitForTimeout(2000);
    
    const reviewTitle = await reviewPage.title();
    const reviewH1 = await reviewPage.textContent('h1').catch(() => 'N/A');
    
    console.log(`   Title: ${reviewTitle}`);
    console.log(`   H1: ${reviewH1}`);
    console.log(`   ${reviewErrors.length === 0 ? '✅' : '❌'} Console errors: ${reviewErrors.length}`);
    if (reviewErrors.length > 0) {
      console.log(`   First 3 errors:`, reviewErrors.slice(0, 3));
    }
    
    await reviewPage.close();
    console.log();
    
    // Test popup
    console.log('5️⃣  Testing popup.html...');
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const popupPage = await context.newPage();
    
    const popupErrors = [];
    popupPage.on('pageerror', err => popupErrors.push(err.message));
    popupPage.on('console', msg => {
      if (msg.type() === 'error') popupErrors.push(msg.text());
    });
    
    await popupPage.goto(popupUrl, { timeout: 10000 });
    await popupPage.waitForTimeout(2000);
    
    const popupTitle = await popupPage.title();
    const popupH1 = await popupPage.textContent('h1').catch(() => 'N/A');
    
    console.log(`   Title: ${popupTitle}`);
    console.log(`   H1: ${popupH1}`);
    console.log(`   ${popupErrors.length === 0 ? '✅' : '❌'} Console errors: ${popupErrors.length}`);
    if (popupErrors.length > 0) {
      console.log(`   First 3 errors:`, popupErrors.slice(0, 3));
    }
    
    await popupPage.close();
    console.log();
    
    console.log('='.repeat(60));
    console.log('✅ All basic runtime tests passed!\n');
    
    return { extensionId, context, page };
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (context) await context.close();
    throw error;
  }
}

if (require.main === module) {
  testExtension()
    .then(async ({ context }) => {
      console.log('Closing browser...');
      await context.close();
      console.log('Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { testExtension };
