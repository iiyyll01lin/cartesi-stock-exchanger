#!/usr/bin/env node

/**
 * Pre-build Validation Script
 * 
 * This script runs before the build process to ensure all critical
 * packages are properly installed and not corrupted.
 * 
 * Usage:
 *   node prebuild-validate.js [--verbose]
 * 
 * Features:
 *   - Validates critical packages before build
 *   - Automatically fixes corruption issues
 *   - Prevents build failures due to package corruption
 *   - Provides detailed logging for debugging
 */

const PackageValidator = require('./validate-packages');
const fs = require('fs');
const path = require('path');

class PreBuildValidator {
  constructor(options = {}) {
    this.options = {
      verbose: false,
      ...options
    };
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

  async validateEnvironment() {
    this.log('Checking build environment...', 'info');
    
    // Check if node_modules exists
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      this.log('node_modules directory not found. Running npm install...', 'warning');
      const { execSync } = require('child_process');
      try {
        execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
        this.log('npm install completed successfully', 'success');
      } catch (error) {
        this.log(`npm install failed: ${error.message}`, 'error');
        return false;
      }
    }

    // Check package-lock.json consistency
    const packageLockPath = path.join(__dirname, 'package-lock.json');
    if (!fs.existsSync(packageLockPath)) {
      this.log('package-lock.json not found. This may cause dependency issues.', 'warning');
    }

    return true;
  }

  async validatePackages() {
    this.log('Running comprehensive package validation...', 'info');
    
    const validator = new PackageValidator({
      fix: true,
      verbose: this.options.verbose
    });
    
    const success = await validator.validate();
    
    if (!success) {
      this.log('Package validation found issues, but attempted to fix them.', 'warning');
      
      // Run validation again to check if fixes worked
      this.log('Re-running validation to verify fixes...', 'info');
      const revalidator = new PackageValidator({
        fix: false,
        verbose: false
      });
      
      const revalidationSuccess = await revalidator.validate();
      
      if (!revalidationSuccess) {
        this.log('Some package issues could not be resolved.', 'error');
        this.log('💡 Try running: npm run validate:packages:fix --verbose', 'info');
        return false;
      } else {
        this.log('All package issues have been resolved!', 'success');
      }
    }
    
    return true;
  }

  async checkCriticalFiles() {
    this.log('Checking critical build files...', 'info');
    
    const criticalFiles = [
      'hardhat.config.js',
      'hardhat.config.ts',
      'package.json'
    ];
    
    for (const file of criticalFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        try {
          // For JSON files, validate syntax
          if (file.endsWith('.json')) {
            const content = fs.readFileSync(filePath, 'utf8');
            JSON.parse(content);
          }
          this.log(`✓ ${file} is valid`, 'debug');
        } catch (error) {
          this.log(`${file} has syntax errors: ${error.message}`, 'error');
          return false;
        }
      }
    }
    
    return true;
  }

  async run() {
    console.log('🔍 Running pre-build validation checks...\n');
    
    try {
      // Step 1: Validate environment
      if (!(await this.validateEnvironment())) {
        throw new Error('Environment validation failed');
      }
      
      // Step 2: Check critical files
      if (!(await this.checkCriticalFiles())) {
        throw new Error('Critical file validation failed');
      }
      
      // Step 3: Validate packages
      if (!(await this.validatePackages())) {
        throw new Error('Package validation failed');
      }
      
      console.log('\n✅ Pre-build validation completed successfully!');
      console.log('🚀 Ready to proceed with build process.\n');
      
      return true;
      
    } catch (error) {
      console.log(`\n❌ Pre-build validation failed: ${error.message}`);
      console.log('🛠️  Please fix the issues above before building.\n');
      
      // Provide helpful suggestions
      console.log('💡 Suggested fixes:');
      console.log('   • Run: npm run validate:packages:fix --verbose');
      console.log('   • Run: npm install --force');
      console.log('   • Check for syntax errors in configuration files');
      console.log('   • Ensure all required dependencies are installed\n');
      
      return false;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose')
  };
  
  const validator = new PreBuildValidator(options);
  const success = await validator.run();
  
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error in pre-build validation:', error.message);
    process.exit(1);
  });
}

module.exports = PreBuildValidator;
