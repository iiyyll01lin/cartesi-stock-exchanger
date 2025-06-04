#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

/**
 * Future-proof Hardhat Solidity compiler management system
 * Handles network issues, version changes, and provides multiple fallback strategies
 */
class CompilerManager {
  constructor() {
    this.solcVersion = this.getSolcVersionFromConfig();
    this.cacheDir = process.env.HARDHAT_COMPILER_CACHE || path.join(os.homedir(), '.cache', 'hardhat-nodejs', 'compilers');
    this.backupCacheDir = '/app/.hardhat-cache/compilers';
    this.localCacheDir = './cache';
    this.maxRetries = 3;
    this.timeoutMs = 300000; // 5 minutes
    
    console.log(`🔧 Compiler Manager initialized for Solidity v${this.solcVersion}`);
  }

  /**
   * Extract Solidity version from hardhat.config.ts/js
   */
  getSolcVersionFromConfig() {
    try {
      // Try to load hardhat config dynamically
      let config;
      if (fs.existsSync('./hardhat.config.ts')) {
        // For TypeScript config, we need to parse it manually since we're in a JS context
        const configContent = fs.readFileSync('./hardhat.config.ts', 'utf8');
        const versionMatch = configContent.match(/solidity:\s*['"]([\d.]+)['"]/);
        if (versionMatch) {
          return versionMatch[1];
        }
      }
      
      if (fs.existsSync('./hardhat.config.js')) {
        config = require(path.resolve('./hardhat.config.js'));
      }
      
      if (config && config.solidity) {
        if (typeof config.solidity === 'string') {
          return config.solidity;
        }
        if (config.solidity.version) {
          return config.solidity.version;
        }
        if (Array.isArray(config.solidity) && config.solidity[0]) {
          return config.solidity[0].version || config.solidity[0];
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not parse Hardhat config, using default version');
    }
    
    return '0.8.20'; // Default fallback
  }

  /**
   * Check if compiler is available in any cache location
   */
  isCompilerCached() {
    const locations = [
      path.join(this.cacheDir, `v${this.solcVersion}`),
      path.join(this.backupCacheDir, `v${this.solcVersion}`),
      path.join(this.localCacheDir, 'compilers', `v${this.solcVersion}`)
    ];

    for (const location of locations) {
      if (fs.existsSync(location)) {
        console.log(`✅ Compiler found in: ${location}`);
        return true;
      }
    }

    console.log(`❌ Compiler v${this.solcVersion} not found in any cache location`);
    return false;
  }

  /**
   * Restore compiler from backup cache if available
   */
  restoreFromBackup() {
    try {
      if (fs.existsSync(this.backupCacheDir)) {
        console.log('📦 Restoring compiler cache from backup...');
        
        // Ensure target directory exists
        fs.mkdirSync(this.cacheDir, { recursive: true });
        
        // Copy from backup
        execSync(`cp -r "${this.backupCacheDir}"/* "${this.cacheDir}/" 2>/dev/null || true`);
        
        if (this.isCompilerCached()) {
          console.log('✅ Compiler successfully restored from backup');
          return true;
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to restore from backup:', error.message);
    }
    
    return false;
  }

  /**
   * Download compiler directly from GitHub releases
   */
  async downloadCompilerDirect() {
    console.log('🔄 Attempting direct compiler download from GitHub...');
    
    try {
      const compilerDir = path.join(this.cacheDir, `v${this.solcVersion}`);
      fs.mkdirSync(compilerDir, { recursive: true });
      
      const solcPath = path.join(compilerDir, 'solc');
      const downloadUrl = `https://github.com/ethereum/solidity/releases/download/v${this.solcVersion}/solc-static-linux`;
      
      await this.downloadFile(downloadUrl, solcPath);
      
      // Make executable
      fs.chmodSync(solcPath, '755');
      
      console.log('✅ Direct compiler download successful');
      return true;
    } catch (error) {
      console.warn('⚠️ Direct download failed:', error.message);
      return false;
    }
  }

  /**
   * Download file with retry logic
   */
  downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      
      const request = https.get(url, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        }
      });
      
      request.on('error', reject);
      request.setTimeout(60000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Run Hardhat compilation with enhanced error handling
   */
  async runHardhatCompile(extraArgs = []) {
    const args = ['hardhat', 'compile', '--force', ...extraArgs];
    
    return new Promise((resolve, reject) => {
      console.log(`🔨 Running: npx ${args.join(' ')}`);
      
      const child = spawn('npx', args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          HARDHAT_NETWORK_TIMEOUT: this.timeoutMs.toString(),
          HARDHAT_COMPILER_CACHE: this.cacheDir
        }
      });
      
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Compilation timeout'));
      }, this.timeoutMs);
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Compilation failed with exit code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Create backup of successfully downloaded compiler
   */
  createBackup() {
    try {
      if (this.isCompilerCached()) {
        console.log('💾 Creating compiler cache backup...');
        fs.mkdirSync(this.backupCacheDir, { recursive: true });
        execSync(`cp -r "${this.cacheDir}"/* "${this.backupCacheDir}/" 2>/dev/null || true`);
        console.log('✅ Compiler cache backup created');
        return true;
      }
    } catch (error) {
      console.warn('⚠️ Failed to create backup:', error.message);
    }
    return false;
  }

  /**
   * Main compiler ensuring method with multiple strategies
   */
  async ensureCompiler() {
    console.log('🔍 Checking Solidity compiler availability...');
    
    // Strategy 1: Check if already cached
    if (this.isCompilerCached()) {
      console.log('✅ Compiler already available');
      return true;
    }
    
    // Strategy 2: Restore from backup
    if (this.restoreFromBackup()) {
      return true;
    }
    
    // Strategy 3: Try standard Hardhat download
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Hardhat download attempt ${attempt}/${this.maxRetries}`);
        await this.runHardhatCompile(['--no-typechain']);
        
        if (this.isCompilerCached()) {
          console.log('✅ Hardhat download successful');
          this.createBackup();
          return true;
        }
      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt} failed:`, error.message);
        if (attempt < this.maxRetries) {
          const delay = attempt * 10000; // Exponential backoff
          console.log(`⏳ Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Strategy 4: Direct download from GitHub
    if (await this.downloadCompilerDirect()) {
      this.createBackup();
      return true;
    }
    
    // Strategy 5: Final attempt with extended timeout
    try {
      console.log('🔄 Final attempt with extended timeout...');
      await this.runHardhatCompile(['--verbose']);
      
      if (this.isCompilerCached()) {
        console.log('✅ Final attempt successful');
        this.createBackup();
        return true;
      }
    } catch (error) {
      console.warn('⚠️ Final attempt failed:', error.message);
    }
    
    console.error('❌ All compiler download strategies failed');
    return false;
  }

  /**
   * Verify compilation works with current setup
   */
  async verifyCompilation() {
    try {
      console.log('🧪 Verifying compilation setup...');
      await this.runHardhatCompile(['--dry-run']);
      console.log('✅ Compilation verification successful');
      return true;
    } catch (error) {
      console.warn('⚠️ Compilation verification failed:', error.message);
      return false;
    }
  }
}

// Main execution
async function main() {
  const manager = new CompilerManager();
  
  try {
    const success = await manager.ensureCompiler();
    
    if (success) {
      console.log('🎉 Compiler setup completed successfully');
      process.exit(0);
    } else {
      console.error('�� Compiler setup failed after all attempts');
      console.error('This may indicate network connectivity issues or missing dependencies');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { CompilerManager };

// Run if called directly
if (require.main === module) {
  main();
}
