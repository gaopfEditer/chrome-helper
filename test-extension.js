const fs = require('fs');
const path = require('path');

console.log('Testing Chrome Extension Structure...\n');

const distDir = path.join(__dirname, 'dist');
const requiredFiles = [
  'manifest.json',
  'background.js',
  'options.html',
  'options.js',
  'options.css',
  'review.html',
  'review.js',
  'review.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'content-binance.js',
  'content-okx.js',
  'content-gate.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

let allPassed = true;

// Check required files
console.log('✓ Checking required files:');
requiredFiles.forEach(file => {
  const filePath = path.join(distDir, file);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  
  if (!exists || size === 0) {
    console.log(`  ✗ ${file} - ${exists ? 'EMPTY' : 'MISSING'}`);
    allPassed = false;
  } else {
    console.log(`  ✓ ${file} (${size} bytes)`);
  }
});

// Validate manifest.json
console.log('\n✓ Validating manifest.json:');
try {
  const manifestPath = path.join(distDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  console.log(`  ✓ Manifest version: ${manifest.manifest_version}`);
  console.log(`  ✓ Extension name: ${manifest.name}`);
  console.log(`  ✓ Version: ${manifest.version}`);
  
  if (manifest.manifest_version !== 3) {
    console.log('  ✗ Not Manifest V3!');
    allPassed = false;
  }
  
  if (!manifest.background || !manifest.background.service_worker) {
    console.log('  ✗ No service worker configured!');
    allPassed = false;
  }
  
  if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
    console.log('  ✗ No content scripts configured!');
    allPassed = false;
  } else {
    console.log(`  ✓ ${manifest.content_scripts.length} content scripts configured`);
  }
  
} catch (error) {
  console.log(`  ✗ Error parsing manifest: ${error.message}`);
  allPassed = false;
}

// Check icon sizes
console.log('\n✓ Checking icon files:');
['icon16.png', 'icon48.png', 'icon128.png'].forEach(icon => {
  const iconPath = path.join(distDir, 'icons', icon);
  if (fs.existsSync(iconPath)) {
    const size = fs.statSync(iconPath).size;
    if (size > 0) {
      console.log(`  ✓ ${icon}: ${size} bytes`);
    } else {
      console.log(`  ✗ ${icon}: EMPTY`);
      allPassed = false;
    }
  } else {
    console.log(`  ✗ ${icon}: MISSING`);
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All checks passed! Extension is ready to load.');
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please review the output above.');
  process.exit(1);
}
