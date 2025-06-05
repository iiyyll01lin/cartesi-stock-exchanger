#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('🔧 Starting version fix process...');
console.log('📋 This will resolve package version conflicts and ensure clean installation');

// Check for version conflicts in package.json
console.log('\n🔍 Checking for version conflicts...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const ethersInDeps = packageJson.devDependencies?.ethers;
  const ethersInOverrides = packageJson.overrides?.ethers;
  const ethersInResolutions = packageJson.resolutions?.ethers;
  
  if (ethersInDeps && (ethersInOverrides || ethersInResolutions)) {
    const overrideVersion = ethersInOverrides || ethersInResolutions;
    if (ethersInDeps !== overrideVersion) {
      console.log(`⚠️ Version conflict detected:`);
      console.log(`   Direct dependency: ethers@${ethersInDeps}`);
      if (ethersInOverrides) console.log(`   Override: ethers@${ethersInOverrides}`);
      if (ethersInResolutions) console.log(`   Resolution: ethers@${ethersInResolutions}`);
      console.log('   Fixing conflicts...');
      
      // Remove conflicting overrides/resolutions for ethers
      if (packageJson.overrides?.ethers) {
        delete packageJson.overrides.ethers;
        if (Object.keys(packageJson.overrides).length === 0) {
          delete packageJson.overrides;
        }
      }
      if (packageJson.resolutions?.ethers) {
        delete packageJson.resolutions.ethers;
        if (Object.keys(packageJson.resolutions).length === 0) {
          delete packageJson.resolutions;
        }
      }
      
      // Ensure consistent ethers version (use the target version)
      if (packageJson.devDependencies.ethers) {
        packageJson.devDependencies.ethers = '^6.13.0';
      }
      
      // Write back the fixed package.json
      fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
      console.log('✅ Version conflicts resolved');
    }
  }
} catch (error) {
  console.warn('⚠️ Could not check version conflicts:', error.message);
}

// Step 1: Clean everything
console.log('\n🧹 Cleaning existing installations...');
try {
  if (fs.existsSync('node_modules')) {
    console.log('   Removing node_modules directory...');
    execSync('rm -rf node_modules', { stdio: 'pipe' });
  }
  if (fs.existsSync('package-lock.json')) {
    console.log('   Removing package-lock.json...');
    execSync('rm -f package-lock.json', { stdio: 'pipe' });
  }
  console.log('✅ Cleanup completed');
} catch (error) {
  console.error('❌ Cleanup failed:', error.message);
  process.exit(1);
}

// Step 2: Clear npm cache
console.log('\n🗑️ Clearing npm cache...');
try {
  execSync('npm cache clean --force', { stdio: 'pipe' });
  console.log('✅ Cache cleared');
} catch (error) {
  console.warn('⚠️ Cache clear failed, continuing...');
}

// Step 3: Install with unified approach
console.log('\n📦 Installing dependencies with unified approach...');
console.log('   This may take a few minutes...');

try {
  // Single install command with proper flags
  console.log('   📦 Installing all dependencies...');
  execSync('npm install --legacy-peer-deps --no-audit --no-fund', { 
    stdio: 'inherit',
    cwd: process.cwd(),
    timeout: 600000 // 10 minutes timeout
  });
  
  console.log('✅ All dependencies installed successfully');
} catch (error) {
  console.error('❌ Installation failed:', error.message);
  console.log('\n💡 Trying fallback installation method...');
  
  try {
    execSync('npm install --legacy-peer-deps --force --no-audit', { 
      stdio: 'inherit',
      cwd: process.cwd(),
      timeout: 600000
    });
    console.log('✅ Fallback installation successful');
  } catch (fallbackError) {
    console.error('❌ Fallback installation also failed:', fallbackError.message);
    process.exit(1);
  }
}

// Step 4: Validate the installation
console.log('\n🔍 Validating installation...');
try {
  // Check if critical packages can be loaded
  const critical = [
    'hardhat',
    'ethers', 
    'hardhat-gas-reporter',
    '@nomicfoundation/hardhat-toolbox'
  ];
  
  for (const pkg of critical) {
    try {
      require.resolve(pkg);
      console.log(`   ✅ ${pkg} - OK`);
    } catch (e) {
      console.log(`   ❌ ${pkg} - MISSING`);
      throw new Error(`Critical package ${pkg} not found`);
    }
  }
  
  // Validate package.json files
  const gasReporterPath = 'node_modules/hardhat-gas-reporter/package.json';
  if (fs.existsSync(gasReporterPath)) {
    try {
      JSON.parse(fs.readFileSync(gasReporterPath, 'utf8'));
      console.log('   ✅ hardhat-gas-reporter package.json - Valid');
    } catch (e) {
      console.log('   ❌ hardhat-gas-reporter package.json - Corrupted');
      throw new Error('hardhat-gas-reporter package.json is corrupted');
    }
  }
  
  console.log('✅ All critical packages validated');
} catch (error) {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
}

console.log('\n🎉 Version fix completed successfully!');
console.log('💡 You can now run: npm run build');
console.log('🐳 Docker build should now work without JSON parsing errors');