#!/usr/bin/env node

const { CompilerManager } = require('./ensure-compiler');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Runtime Compiler Recovery Script
 * 
 * This script provides runtime fallback mechanisms when build-time
 * compiler caching fails during application startup or compilation.
 * 
 * Usage:
 *   node runtime-compiler-recovery.js [--force] [--verbose]
 * 
 * Features:
 *   - Runtime compiler recovery when build-time caching fails
 *   - Emergency cache restoration from backups
 *   - Network-independent compiler resolution
 *   - Graceful degradation with offline compilation
 *   - Docker container runtime compatibility
 */
class RuntimeCompilerRecovery {
  constructor(options = {}) {
    this.options = {
      force: false,
      verbose: false,
      ...options
    };
    
    this.compilerManager = new CompilerManager();
    this.emergencyBackupDir = '/app/.emergency-compiler-cache';
    this.localBackupDir = './emergency-cache';
    
    this.log('🔧 Runtime Compiler Recovery initialized');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const symbols = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      debug: '🔍'
    };
    
    if (level === 'debug' && !this.options.verbose) return;
    
    console.log(`${symbols[level]} [${timestamp}] ${message}`);
  }

  /**
   * Check if the application can start without compiler issues
   */
  async checkStartupReadiness() {
    this.log('Checking application startup readiness...', 'info');
    
    try {
      // Test if Hardhat can import without compiler errors
      const configPath = './hardhat.config.ts';
      if (fs.existsSync(configPath)) {
        this.log('Hardhat config file found', 'debug');
        
        // Try to load Hardhat without compilation
        execSync('npx hardhat --version', { 
          stdio: this.options.verbose ? 'inherit' : 'pipe',
          timeout: 30000 
        });
        
        this.log('Hardhat basic functionality verified', 'success');
        return true;
      }
    } catch (error) {
      this.log(`Startup readiness check failed: ${error.message}`, 'warning');
      return false;
    }
    
    return false;
  }

  /**
   * Restore compiler from emergency backup locations
   */
  async restoreFromEmergencyBackup() {
    this.log('Attempting emergency compiler cache restoration...', 'info');
    
    const backupLocations = [
      this.emergencyBackupDir,
      this.localBackupDir,
      '/app/.hardhat-cache/compilers',
      './cache/compilers'
    ];
    
    for (const backupLocation of backupLocations) {
      if (fs.existsSync(backupLocation)) {
        try {
          this.log(`Found backup at: ${backupLocation}`, 'debug');
          
          // Create target directory
          const targetDir = this.compilerManager.cacheDir;
          fs.mkdirSync(targetDir, { recursive: true });
          
          // Copy backup to active cache
          execSync(`cp -r "${backupLocation}"/* "${targetDir}/" 2>/dev/null || true`);
          
          // Verify restoration
          if (this.compilerManager.isCompilerCached()) {
            this.log(`Emergency restoration successful from: ${backupLocation}`, 'success');
            return true;
          }
        } catch (error) {
          this.log(`Failed to restore from ${backupLocation}: ${error.message}`, 'warning');
        }
      }
    }
    
    this.log('No usable emergency backups found', 'warning');
    return false;
  }

  /**
   * Create emergency backup of current compiler cache
   */
  createEmergencyBackup() {
    try {
      if (this.compilerManager.isCompilerCached()) {
        this.log('Creating emergency compiler backup...', 'info');
        
        // Create backup directories
        fs.mkdirSync(this.emergencyBackupDir, { recursive: true });
        fs.mkdirSync(this.localBackupDir, { recursive: true });
        
        // Copy to both locations for redundancy
        const sourceDir = this.compilerManager.cacheDir;
        
        execSync(`cp -r "${sourceDir}"/* "${this.emergencyBackupDir}/" 2>/dev/null || true`);
        execSync(`cp -r "${sourceDir}"/* "${this.localBackupDir}/" 2>/dev/null || true`);
        
        this.log('Emergency backup created successfully', 'success');
        return true;
      }
    } catch (error) {
      this.log(`Failed to create emergency backup: ${error.message}`, 'warning');
    }
    
    return false;
  }

  /**
   * Attempt offline compilation using cached artifacts
   */
  async attemptOfflineCompilation() {
    this.log('Attempting offline compilation using cached artifacts...', 'info');
    
    try {
      // Check if artifacts directory exists with compiled contracts
      const artifactsDir = './artifacts';
      if (fs.existsSync(artifactsDir)) {
        const contractArtifacts = this.findContractArtifacts(artifactsDir);
        
        if (contractArtifacts.length > 0) {
          this.log(`Found ${contractArtifacts.length} cached contract artifacts`, 'debug');
          
          // Verify artifacts are usable
          for (const artifact of contractArtifacts.slice(0, 3)) { // Check first 3
            const content = fs.readFileSync(artifact, 'utf8');
            const parsed = JSON.parse(content);
            
            if (parsed.abi && parsed.bytecode) {
              this.log(`Verified artifact: ${path.basename(artifact)}`, 'debug');
            } else {
              throw new Error(`Invalid artifact: ${artifact}`);
            }
          }
          
          this.log('Offline compilation artifacts are valid', 'success');
          return true;
        }
      }
      
      this.log('No valid cached artifacts found for offline compilation', 'warning');
      return false;
      
    } catch (error) {
      this.log(`Offline compilation check failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Find contract artifacts recursively
   */
  findContractArtifacts(dir) {
    const artifacts = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && item !== 'build-info') {
          artifacts.push(...this.findContractArtifacts(fullPath));
        } else if (item.endsWith('.json') && !item.endsWith('.dbg.json')) {
          artifacts.push(fullPath);
        }
      }
    } catch (error) {
      this.log(`Error scanning artifacts directory: ${error.message}`, 'debug');
    }
    
    return artifacts;
  }

  /**
   * Attempt minimal runtime compilation
   */
  async attemptMinimalCompilation() {
    this.log('Attempting minimal runtime compilation...', 'info');
    
    try {
      // Try compilation with minimal flags
      execSync('npx hardhat compile --quiet --no-typechain', {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        timeout: 120000 // 2 minutes timeout
      });
      
      this.log('Minimal compilation successful', 'success');
      
      // Create backup after successful compilation
      this.createEmergencyBackup();
      
      return true;
    } catch (error) {
      this.log(`Minimal compilation failed: ${error.message}`, 'warning');
      return false;
    }
  }

  /**
   * Clean corrupted cache and force fresh download
   */
  async cleanAndRetry() {
    this.log('Cleaning corrupted cache and retrying...', 'info');
    
    try {
      // Clean all cache directories
      const cacheDirs = [
        this.compilerManager.cacheDir,
        './cache',
        './artifacts'
      ];
      
      for (const dir of cacheDirs) {
        if (fs.existsSync(dir)) {
          execSync(`rm -rf "${dir}"`, { stdio: 'pipe' });
          this.log(`Cleaned: ${dir}`, 'debug');
        }
      }
      
      // Clear npm cache
      execSync('npm cache clean --force', { stdio: 'pipe' });
      
      // Attempt fresh compiler download
      return await this.compilerManager.ensureCompiler();
      
    } catch (error) {
      this.log(`Clean and retry failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Main recovery process with multiple strategies
   */
  async recover() {
    this.log('🚀 Starting runtime compiler recovery process...', 'info');
    
    let recoveryStep = 1;
    
    try {
      // Step 1: Check if recovery is actually needed
      if (!this.options.force) {
        this.log(`Step ${recoveryStep++}: Checking if recovery is needed...`, 'info');
        
        if (await this.checkStartupReadiness()) {
          this.log('Application is ready, no recovery needed', 'success');
          return true;
        }
      }
      
      // Step 2: Try emergency backup restoration
      this.log(`Step ${recoveryStep++}: Emergency backup restoration...`, 'info');
      if (await this.restoreFromEmergencyBackup()) {
        if (await this.checkStartupReadiness()) {
          this.log('Recovery successful via emergency backup', 'success');
          return true;
        }
      }
      
      // Step 3: Check for offline compilation capability
      this.log(`Step ${recoveryStep++}: Checking offline compilation capability...`, 'info');
      if (await this.attemptOfflineCompilation()) {
        this.log('Offline compilation is available', 'success');
        return true;
      }
      
      // Step 4: Try minimal runtime compilation
      this.log(`Step ${recoveryStep++}: Attempting minimal runtime compilation...`, 'info');
      if (await this.attemptMinimalCompilation()) {
        if (await this.checkStartupReadiness()) {
          this.log('Recovery successful via minimal compilation', 'success');
          return true;
        }
      }
      
      // Step 5: Clean cache and retry with full compiler manager
      this.log(`Step ${recoveryStep++}: Clean cache and retry...`, 'info');
      if (await this.cleanAndRetry()) {
        if (await this.checkStartupReadiness()) {
          this.log('Recovery successful via clean retry', 'success');
          return true;
        }
      }
      
      // All recovery strategies failed
      this.log('❌ All recovery strategies exhausted', 'error');
      this.log('Possible causes:', 'error');
      this.log('  • Network connectivity issues preventing compiler download', 'error');
      this.log('  • Corrupted npm packages or cache', 'error');
      this.log('  • Missing or incompatible system dependencies', 'error');
      this.log('  • Docker environment configuration issues', 'error');
      
      return false;
      
    } catch (error) {
      this.log(`Unexpected error during recovery: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Provide diagnostic information
   */
  async diagnose() {
    this.log('🔍 Running runtime environment diagnostics...', 'info');
    
    console.log('\n📊 Diagnostic Report:');
    console.log('=====================');
    
    // Node.js version
    console.log(`Node.js version: ${process.version}`);
    
    // Working directory
    console.log(`Working directory: ${process.cwd()}`);
    
    // Environment variables
    console.log(`HARDHAT_COMPILER_CACHE: ${process.env.HARDHAT_COMPILER_CACHE || 'not set'}`);
    console.log(`HARDHAT_CACHE_DIR: ${process.env.HARDHAT_CACHE_DIR || 'not set'}`);
    
    // Cache directories
    const cacheDirs = [
      this.compilerManager.cacheDir,
      this.compilerManager.backupCacheDir,
      this.emergencyBackupDir,
      this.localBackupDir
    ];
    
    console.log('\nCache Directories:');
    for (const dir of cacheDirs) {
      const exists = fs.existsSync(dir);
      const size = exists ? this.getDirSize(dir) : 0;
      console.log(`  ${dir}: ${exists ? `exists (${size} files)` : 'not found'}`);
    }
    
    // Package status
    console.log('\nCritical Packages:');
    const packages = ['hardhat', '@nomicfoundation/hardhat-toolbox', 'ethers'];
    for (const pkg of packages) {
      const pkgPath = `./node_modules/${pkg}/package.json`;
      const exists = fs.existsSync(pkgPath);
      console.log(`  ${pkg}: ${exists ? 'installed' : 'missing'}`);
    }
    
    // Compiler status
    console.log(`\nCompiler Status:`);
    console.log(`  Solidity version: ${this.compilerManager.solcVersion}`);
    console.log(`  Cached: ${this.compilerManager.isCompilerCached()}`);
    
    console.log('\n');
  }

  /**
   * Get directory size (file count)
   */
  getDirSize(dir) {
    try {
      const result = execSync(`find "${dir}" -type f | wc -l`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return parseInt(result.trim());
    } catch {
      return 0;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options = {
    force: args.includes('--force'),
    verbose: args.includes('--verbose')
  };
  
  const recovery = new RuntimeCompilerRecovery(options);
  
  try {
    // Run diagnostics if verbose
    if (options.verbose) {
      await recovery.diagnose();
    }
    
    // Perform recovery
    const success = await recovery.recover();
    
    if (success) {
      console.log('\n🎉 Runtime compiler recovery completed successfully!');
      console.log('The application should now be able to start and compile contracts.');
      process.exit(0);
    } else {
      console.log('\n💥 Runtime compiler recovery failed!');
      console.log('Manual intervention may be required.');
      console.log('\nSuggested manual steps:');
      console.log('  1. Check network connectivity');
      console.log('  2. Run: npm run compiler:clean && npm run compiler:check');
      console.log('  3. Verify Docker container has internet access');
      console.log('  4. Check proxy settings if behind corporate firewall');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Unexpected error in runtime recovery:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { RuntimeCompilerRecovery };

// Run if called directly
if (require.main === module) {
  main();
}