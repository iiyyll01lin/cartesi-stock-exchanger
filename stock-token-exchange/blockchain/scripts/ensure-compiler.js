#!/usr/bin/env node

/**
 * Enhanced Compiler Manager for Blockchain Service
 * 
 * This module provides robust compiler management for Solidity compilers
 * with multiple fallback strategies to handle network connectivity issues,
 * Docker environment challenges, and ensure consistent builds.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const https = require('https');

/**
 * CompilerManager class for Hardhat Solidity compiler management
 * Handles compiler validation, caching,// Script can be run directly
async function main() {
  const isVerbose = process.argv.includes('--verbose');
  const forceDownload = process.argv.includes('--force');
  
  // Check for network connectivity and proxy settings
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.PROXY_URL || '';
  console.log('🔍 Checking Solidity compiler availability...');
  console.log(`🌐 Network configuration: ${proxyUrl ? 'Using proxy: ' + proxyUrl : 'Direct connection'}`);
  
  // Test network connectivity before attempting downloads
  try {
    // Test direct connection first
    console.log('🔄 Testing direct internet connectivity...');
    await new Promise((resolve, reject) => {
      const req = https.get('https://registry.npmjs.org/', { timeout: 5000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch (error) {
    console.warn('⚠️ Network connectivity test failed, but continuing anyway');
  }
  
  const manager = new CompilerManager({ verbose: isVerbose });
  
  if (!forceDownload && manager.isCompilerCached()) {
    console.log('✅ Solidity compiler is already cached');
    process.exit(0);
  }
  
  if (await manager.ensureCompiler()) {
    console.log('✅ Successfully ensured Solidity compiler availability');
    process.exit(0);
  } else {
    console.error('❌ Failed to ensure Solidity compiler availability');
    process.exit(1);
  }th robust error handling
 */
class CompilerManager {
  constructor(options = {}) {
    this.options = {
      solcVersion: this.getSolcVersionFromConfig(),
      maxRetries: 3,
      timeoutMs: 300000, // 5 minutes
      verbose: false,
      ...options
    };

    // Define cache directories with highest priority first
    this.cacheDir = process.env.HARDHAT_COMPILER_CACHE || path.join(os.homedir(), '.cache', 'hardhat-nodejs', 'compilers');
    this.backupCacheDir = '/app/.hardhat-cache/compilers';
    this.localCacheDir = './cache/compilers';
    this.emergencyDir = './emergency-compiler-cache';

    if (this.options.verbose) {
      console.log(`🔧 Compiler Manager initialized for Solidity v${this.options.solcVersion}`);
      console.log(`📂 Primary cache: ${this.cacheDir}`);
      console.log(`📂 Backup cache: ${this.backupCacheDir}`);
    }

    // Ensure cache directories exist
    this.ensureCacheDirs();
  }

  /**
   * Ensure all cache directories exist
   */
  ensureCacheDirs() {
    [this.cacheDir, this.backupCacheDir, this.localCacheDir, this.emergencyDir].forEach(dir => {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (error) {
        // Some directories may be inaccessible in certain environments, that's ok
        if (this.options.verbose) {
          console.warn(`⚠️ Could not create directory ${dir}: ${error.message}`);
        }
      }
    });
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
   * Check if the compiler is already cached in any of our locations
   */
  isCompilerCached() {
    const versionDir = `v${this.options.solcVersion}`;
    
    // Check all possible cache locations
    const locations = [
      path.join(this.cacheDir, versionDir),
      path.join(this.backupCacheDir, versionDir),
      path.join(this.localCacheDir, versionDir),
      path.join(this.emergencyDir, versionDir)
    ];

    for (const location of locations) {
      const solcFile = path.join(location, 'solc');
      if (fs.existsSync(solcFile)) {
        if (this.options.verbose) {
          console.log(`✅ Found compiler at: ${location}`);
        }
        return true;
      }
    }

    if (this.options.verbose) {
      console.log(`❌ Compiler v${this.options.solcVersion} not found in any cache location`);
    }
    return false;
  }
  
  /**
   * Main method to ensure compiler is available, trying multiple strategies
   */
  async ensureCompiler() {
    if (this.isCompilerCached()) {
      console.log(`✅ Solidity compiler v${this.options.solcVersion} is already cached`);
      return true;
    }
    
    console.log(`🔍 Solidity compiler v${this.options.solcVersion} not found - initiating download...`);
    
    // Try multiple strategies in sequence
    const strategies = [
      this.restoreFromBackup.bind(this),
      this.downloadUsingHardhat.bind(this),
      this.downloadCompilerDirect.bind(this)
    ];
    
    for (const strategy of strategies) {
      try {
        const success = await strategy();
        if (success && this.isCompilerCached()) {
          this.createBackup();
          return true;
        }
      } catch (error) {
        console.warn(`⚠️ Strategy failed: ${error.message}`);
      }
    }
    
    console.error(`❌ All compiler download strategies failed for Solidity v${this.options.solcVersion}`);
    return false;
  }

  /**
   * Restore compiler from backup cache if available
   */
  async restoreFromBackup() {
    console.log('🔄 Attempting to restore compiler from backup...');
    
    const backupLocations = [
      this.backupCacheDir, 
      this.localCacheDir, 
      this.emergencyDir
    ];
    
    for (const backupDir of backupLocations) {
      const versionDir = path.join(backupDir, `v${this.options.solcVersion}`);
      const solcPath = path.join(versionDir, 'solc');
      
      if (fs.existsSync(solcPath)) {
        console.log(`📦 Found backup at: ${versionDir}`);
        
        try {
          // Ensure target directory exists
          fs.mkdirSync(path.join(this.cacheDir, `v${this.options.solcVersion}`), { recursive: true });
          
          // Copy from backup to primary cache
          execSync(`cp -f "${solcPath}" "${path.join(this.cacheDir, `v${this.options.solcVersion}`, 'solc')}"`);
          
          // Make sure it's executable
          fs.chmodSync(path.join(this.cacheDir, `v${this.options.solcVersion}`, 'solc'), '755');
          
          console.log('✅ Compiler successfully restored from backup');
          return true;
        } catch (error) {
          console.warn(`⚠️ Failed to restore from ${backupDir}: ${error.message}`);
        }
      }
    }
    
    console.log('❌ No usable backup found');
    return false;
  }

  /**
   * Download the compiler using Hardhat's built-in mechanism
   */
  async downloadUsingHardhat() {
    console.log('🔄 Downloading compiler using Hardhat...');
    
    // Get proxy from environment variables
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.PROXY_URL || '';
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`⏳ Retry attempt ${attempt}/${this.options.maxRetries}...`);
        }
        
        // Setup environment with proxy if available
        const env = { ...process.env };
        if (proxyUrl) {
          console.log(`Using proxy for Hardhat: ${proxyUrl}`);
          env.HTTP_PROXY = proxyUrl;
          env.HTTPS_PROXY = proxyUrl;
        }
        
        console.log(`🔨 Running: npx hardhat compile --force --no-typechain`);
        
        // Force hardhat to download the compiler with proxy config
        execSync('npx hardhat compile --force --no-typechain', {
          stdio: this.options.verbose ? 'inherit' : 'pipe',
          env: env,
          timeout: this.options.timeoutMs
        });
        
        if (this.isCompilerCached()) {
          console.log('✅ Hardhat compiler download successful');
          return true;
        }
      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.options.maxRetries) {
          const delay = attempt * 5000; // Exponential backoff
          console.log(`⏱️ Waiting ${delay/1000} seconds before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.log('❌ Hardhat download failed after all attempts');
    return false;
  }

  /**
   * Download compiler directly from GitHub releases
   */
  async downloadCompilerDirect() {
    console.log('🔄 Attempting direct compiler download from GitHub...');
    
    try {
      const compilerDir = path.join(this.cacheDir, `v${this.options.solcVersion}`);
      fs.mkdirSync(compilerDir, { recursive: true });
      
      const solcPath = path.join(compilerDir, 'solc');
      const downloadUrl = `https://github.com/ethereum/solidity/releases/download/v${this.options.solcVersion}/solc-static-linux`;
      
      // Try also with a mirror site if GitHub fails
      const mirrorUrl = `https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v${this.options.solcVersion}`;
      
      try {
        console.log(`Attempting download from GitHub: ${downloadUrl}`);
        await this.downloadFile(downloadUrl, solcPath);
      } catch (githubError) {
        console.warn(`⚠️ GitHub download failed: ${githubError.message}`);
        console.log(`Falling back to mirror site: ${mirrorUrl}`);
        await this.downloadFile(mirrorUrl, solcPath);
      }
      
      // Make executable
      fs.chmodSync(solcPath, '755');
      
      console.log('✅ Direct compiler download successful');
      return true;
    } catch (error) {
      console.warn(`⚠️ Direct download failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Download file with retry logic and proxy support
   */
  downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      // Get proxy URL from environment variables
      const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.PROXY_URL || '';
      console.log(`🌐 Network config: ${proxyUrl ? 'Using proxy: ' + proxyUrl : 'Direct connection'}`);
      
      const file = fs.createWriteStream(outputPath);
      
      let requestOptions = url;
      
      // Handle proxy if available
      if (proxyUrl) {
        console.log(`🔄 Attempting download with proxy: ${proxyUrl}`);
        try {
          const parsedProxyUrl = new URL(proxyUrl);
          const parsedTargetUrl = new URL(url);
          
          requestOptions = {
            host: parsedProxyUrl.hostname,
            port: parsedProxyUrl.port || 80,
            path: url,
            method: 'GET',
            headers: {
              Host: parsedTargetUrl.host
            }
          };
        } catch (error) {
          console.warn(`⚠️ Invalid proxy URL format, falling back to direct connection: ${error.message}`);
        }
      }
      
      const request = https.get(requestOptions, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`↪️ Following redirect to: ${response.headers.location}`);
          file.close();
          this.downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
          return;
        }
        
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else {
          file.close();
          fs.unlink(outputPath, () => {}); // Clean up failed download
          
          // If using proxy and got an error, try direct connection as fallback
          if (proxyUrl) {
            console.log(`⚠️ Proxy download failed with status ${response.statusCode}, trying direct connection...`);
            
            // Temporarily unset proxy for this download
            const originalHttpProxy = process.env.HTTP_PROXY;
            const originalHttpsProxy = process.env.HTTPS_PROXY;
            process.env.HTTP_PROXY = '';
            process.env.HTTPS_PROXY = '';
            
            this.downloadFile(url, outputPath)
              .then(resolve)
              .catch((directError) => {
                // Restore proxy settings
                process.env.HTTP_PROXY = originalHttpProxy;
                process.env.HTTPS_PROXY = originalHttpsProxy;
                
                reject(new Error(`Both proxy and direct downloads failed: ${directError.message}`));
              });
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          }
        }
      });
      
      request.on('error', (err) => {
        file.close();
        fs.unlink(outputPath, () => {}); // Clean up failed download
        
        // If using proxy and got a connection error, try direct as fallback
        if (proxyUrl) {
          console.log(`⚠️ Proxy connection error: ${err.message}, trying direct connection...`);
          
          // Temporarily unset proxy for this download
          const originalHttpProxy = process.env.HTTP_PROXY;
          const originalHttpsProxy = process.env.HTTPS_PROXY;
          process.env.HTTP_PROXY = '';
          process.env.HTTPS_PROXY = '';
          
          this.downloadFile(url, outputPath)
            .then(resolve)
            .catch((directError) => {
              // Restore proxy settings
              process.env.HTTP_PROXY = originalHttpProxy;
              process.env.HTTPS_PROXY = originalHttpsProxy;
              
              reject(new Error(`Both proxy and direct downloads failed: ${directError.message}`));
            });
        } else {
          reject(err);
        }
      });
      
      request.setTimeout(60000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Helper method to download file with explicit proxy support
   */
  downloadFileWithProxy(url, outputPath, proxyUrl) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      let completed = false;
      
      try {
        // Parse URLs
        const targetUrl = new URL(url);
        const proxy = new URL(proxyUrl);
        
        // Configure proxy request
        const options = {
          host: proxy.hostname,
          port: proxy.port || 80,
          method: 'GET',
          path: url, // Full URL for proxy request
          headers: {
            Host: targetUrl.host
          }
        };
        
        console.log(`Downloading via proxy: ${proxyUrl}`);
        
        // Use http or https module depending on proxy protocol
        const httpModule = proxy.protocol === 'https:' ? https : require('http');
        
        const request = httpModule.request(options, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log(`Following redirect to: ${response.headers.location}`);
            file.close();
            this.downloadFileWithProxy(response.headers.location, outputPath, proxyUrl)
              .then(resolve)
              .catch(reject);
            return;
          }
          
          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(outputPath, () => {});
            reject(new Error(`HTTP ${response.statusCode} via proxy: ${response.statusMessage || 'Unknown error'}`));
            return;
          }
          
          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            completed = true;
            resolve();
          });
          
          response.on('error', (err) => {
            if (!completed) {
              file.close();
              fs.unlink(outputPath, () => {});
              reject(err);
            }
          });
        });
        
        request.on('error', (err) => {
          if (!completed) {
            file.close();
            fs.unlink(outputPath, () => {});
            reject(err);
          }
        });
        
        request.on('timeout', () => {
          if (!completed) {
            request.abort();
            file.close();
            fs.unlink(outputPath, () => {});
            reject(new Error('Request timed out'));
          }
        });
        
        // Set timeout
        request.setTimeout(30000); // 30 seconds
        
        // End the request
        request.end();
        
      } catch (err) {
        file.close();
        fs.unlink(outputPath, () => {});
        reject(err);
      }
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
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        env: {
          ...process.env,
          HARDHAT_NETWORK_TIMEOUT: this.options.timeoutMs.toString(),
          HARDHAT_COMPILER_CACHE: this.cacheDir
        }
      });
      
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Compilation timeout'));
      }, this.options.timeoutMs);
      
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
      const sourceDir = path.join(this.cacheDir, `v${this.options.solcVersion}`);
      const solcFile = path.join(sourceDir, 'solc');
      
      if (fs.existsSync(solcFile)) {
        console.log('💾 Creating compiler backup...');
        
        const backupLocations = [
          path.join(this.backupCacheDir, `v${this.options.solcVersion}`),
          path.join(this.localCacheDir, `v${this.options.solcVersion}`),
          path.join(this.emergencyDir, `v${this.options.solcVersion}`)
        ];
        
        backupLocations.forEach(backupDir => {
          try {
            fs.mkdirSync(backupDir, { recursive: true });
            fs.copyFileSync(solcFile, path.join(backupDir, 'solc'));
            fs.chmodSync(path.join(backupDir, 'solc'), '755');
          } catch (error) {
            console.warn(`⚠️ Failed to backup to ${backupDir}: ${error.message}`);
          }
        });
        
        console.log('✅ Compiler backup created');
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to create backup: ${error.message}`);
    }
    
    return false;
  }
}

// Script can be run directly
async function main() {
  const isVerbose = process.argv.includes('--verbose');
  const forceDownload = process.argv.includes('--force');
  
  console.log('🔍 Checking Solidity compiler availability...');
  const manager = new CompilerManager({ verbose: isVerbose });
  
  if (!forceDownload && manager.isCompilerCached()) {
    console.log('✅ Solidity compiler is already cached');
    process.exit(0);
  }
  
  if (await manager.ensureCompiler()) {
    console.log('✅ Solidity compiler is ready');
    process.exit(0);
  } else {
    console.error('❌ Failed to ensure Solidity compiler');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { CompilerManager };
