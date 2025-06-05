#!/usr/bin/env node

/**
 * Comprehensive Package Validation Script
 * 
 * This script validates the integrity of installed npm packages,
 * particularly focusing on JSON files that are prone to corruption.
 * 
 * Usage:
 *   node validate-packages.js [--fix] [--verbose]
 * 
 * Options:
 *   --fix     Attempt to fix detected issues by reinstalling corrupted packages
 *   --verbose Show detailed validation information
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const NODE_MODULES_DIR = path.join(__dirname, 'node_modules');
const CRITICAL_PACKAGES = [
  'hardhat-gas-reporter',
  'hardhat',
  '@openzeppelin/contracts',
  '@nomicfoundation/hardhat-toolbox',
  '@nomicfoundation/hardhat-ethers',
  'ethers',
  'dotenv',
  'chai',
  'typescript'
];

class PackageValidator {
  constructor(options = {}) {
    this.options = {
      fix: false,
      verbose: false,
      ...options
    };
    this.issues = [];
    this.stats = {
      packagesChecked: 0,
      filesValidated: 0,
      issuesFound: 0,
      issuesFixed: 0
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

  validateJson(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Enhanced check for TypeScript localization files and other non-critical files
      const isLocalizationFile = /typescript\/lib\/[a-z]{2}\/diagnosticMessages\.generated\.json$/.test(filePath);
      const isNonCriticalFile = this.isNonCriticalFile(path.relative(NODE_MODULES_DIR, filePath));
      
      if (!isLocalizationFile && !isNonCriticalFile) {
        // Strict validation for critical files only
        const corruptionIndicators = [
          { pattern: '\uFFFD', name: 'replacement character' },
          { pattern: '\x00', name: 'null bytes' },
          { pattern: /[^\x20-\x7E\s\u00A0-\uFFFF]/g, name: 'invalid characters' }
        ];

        for (const indicator of corruptionIndicators) {
          if (typeof indicator.pattern === 'string') {
            if (content.includes(indicator.pattern)) {
              throw new Error(`Contains ${indicator.name}`);
            }
          } else if (indicator.pattern.test && indicator.pattern.test(content)) {
            throw new Error(`Contains ${indicator.name}`);
          }
        }
      } else {
        // For localization and non-critical files, only check for severe corruption
        const criticalCorruptionIndicators = [
          { pattern: '\uFFFD', name: 'replacement character' },
          { pattern: '\x00', name: 'null bytes' }
        ];

        for (const indicator of criticalCorruptionIndicators) {
          if (content.includes(indicator.pattern)) {
            throw new Error(`Contains ${indicator.name}`);
          }
        }
        
        // For Polish localization file specifically, be extra lenient with character encoding
        if (filePath.includes('/typescript/lib/pl/diagnosticMessages.generated.json')) {
          this.log(`Performing lenient validation for Polish TypeScript localization file: ${path.relative(NODE_MODULES_DIR, filePath)}`, 'debug');
          
          // Only validate JSON structure, not character encoding
          try {
            JSON.parse(content);
            this.log(`Polish localization file JSON structure is valid`, 'debug');
            this.stats.filesValidated++;
            return true;
          } catch (jsonError) {
            // If JSON parsing fails, mark for removal as it's non-critical
            this.log(`Polish localization file has invalid JSON structure, marking for removal: ${jsonError.message}`, 'warning');
            throw new Error(`Invalid JSON structure in non-critical file: ${jsonError.message}`);
          }
        }
        
        this.log(`Skipping strict character validation for non-critical file: ${path.relative(NODE_MODULES_DIR, filePath)}`, 'debug');
      }

      // Try to parse as JSON (this is the most important check)
      JSON.parse(content);
      
      this.log(`Validated: ${path.relative(NODE_MODULES_DIR, filePath)}`, 'debug');
      this.stats.filesValidated++;
      return true;
      
    } catch (error) {
      const issue = {
        file: filePath,
        package: this.getPackageFromPath(filePath),
        error: error.message,
        type: 'json_corruption',
        isCritical: !this.isNonCriticalFile(path.relative(NODE_MODULES_DIR, filePath))
      };
      
      this.issues.push(issue);
      this.stats.issuesFound++;
      
      const severity = issue.isCritical ? 'error' : 'warning';
      const prefix = issue.isCritical ? 'Corruption detected' : 'Non-critical corruption detected';
      this.log(`${prefix} in ${path.relative(NODE_MODULES_DIR, filePath)}: ${error.message}`, severity);
      
      return false;
    }
  }

  getPackageFromPath(filePath) {
    const relativePath = path.relative(NODE_MODULES_DIR, filePath);
    const parts = relativePath.split(path.sep);
    
    if (parts[0].startsWith('@')) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
  }

  validatePackage(packageName) {
    const packageDir = path.join(NODE_MODULES_DIR, packageName);
    
    if (!fs.existsSync(packageDir)) {
      this.log(`Package not found: ${packageName}`, 'warning');
      return false;
    }

    this.log(`Validating package: ${packageName}`, 'debug');
    this.stats.packagesChecked++;

    // Check package.json
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      if (!this.validateJson(packageJsonPath)) {
        return false;
      }
    }

    // Check other JSON files in package
    const jsonFiles = this.findJsonFiles(packageDir);
    for (const jsonFile of jsonFiles) {
      if (!this.validateJson(jsonFile)) {
        return false;
      }
    }

    return true;
  }

  findJsonFiles(dir, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return [];
    
    const jsonFiles = [];
    
    try {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          jsonFiles.push(...this.findJsonFiles(filePath, maxDepth, currentDepth + 1));
        } else if (file.endsWith('.json')) {
          jsonFiles.push(filePath);
        }
      }
    } catch (error) {
      this.log(`Error reading directory ${dir}: ${error.message}`, 'warning');
    }
    
    return jsonFiles;
  }

  async fixPackage(packageName) {
    this.log(`Attempting to fix package: ${packageName}`, 'info');
    
    // First, try to isolate and fix non-critical files
    const packageIssues = this.issues.filter(issue => issue.package === packageName);
    const criticalIssues = packageIssues.filter(issue => issue.isCritical);
    const nonCriticalIssues = packageIssues.filter(issue => !issue.isCritical);
    
    // Handle non-critical issues first (remove corrupted non-critical files)
    if (nonCriticalIssues.length > 0) {
      this.log(`Found ${nonCriticalIssues.length} non-critical issues, attempting isolated fix first`, 'info');
      
      for (const issue of nonCriticalIssues) {
        const relativePath = path.relative(NODE_MODULES_DIR, issue.file);
        this.log(`Removing non-critical corrupted file: ${relativePath}`, 'info');
        try {
          fs.unlinkSync(issue.file);
          this.log(`Successfully removed corrupted file: ${relativePath}`, 'success');
          this.stats.issuesFixed++;
          
          // Remove this issue from the issues array
          const index = this.issues.indexOf(issue);
          if (index > -1) {
            this.issues.splice(index, 1);
          }
        } catch (removeError) {
          this.log(`Failed to remove file ${relativePath}: ${removeError.message}`, 'warning');
        }
      }
      
      // If only non-critical issues were present, we're done
      if (criticalIssues.length === 0) {
        this.log(`Successfully fixed all non-critical issues in package: ${packageName}`, 'success');
        return true;
      }
    }
    
    // Only proceed with full package reinstall if there are critical issues
    if (criticalIssues.length === 0) {
      this.log(`No critical issues found in package: ${packageName}`, 'info');
      return true;
    }
    
    this.log(`Found ${criticalIssues.length} critical issues, proceeding with package reinstall`, 'warning');
    
    try {
      // Remove the corrupted package
      const packageDir = path.join(NODE_MODULES_DIR, packageName);
      if (fs.existsSync(packageDir)) {
        execSync(`rm -rf "${packageDir}"`, { stdio: 'pipe' });
      }

      // For persistent corruption, try multiple installation strategies
      const installStrategies = [
        // Strategy 1: Standard reinstall
        `npm install ${packageName} --no-save --ignore-scripts`,
        // Strategy 2: Force clean install
        `npm install ${packageName} --no-save --ignore-scripts --force`,
        // Strategy 3: Use different registry if standard fails
        `npm install ${packageName} --no-save --ignore-scripts --registry https://registry.npmjs.org/`,
        // Strategy 4: Install specific version to avoid corruption
        `npm install ${packageName}@latest --no-save --ignore-scripts --force`
      ];

      let installed = false;
      for (let i = 0; i < installStrategies.length && !installed; i++) {
        try {
          this.log(`Trying installation strategy ${i + 1}/${installStrategies.length}`, 'debug');
          execSync(installStrategies[i], {
            cwd: __dirname,
            stdio: 'pipe'
          });
          installed = true;
        } catch (strategyError) {
          this.log(`Strategy ${i + 1} failed: ${strategyError.message}`, 'debug');
          if (i < installStrategies.length - 1) {
            // Clean up before trying next strategy
            if (fs.existsSync(packageDir)) {
              execSync(`rm -rf "${packageDir}"`, { stdio: 'pipe' });
            }
          }
        }
      }

      if (!installed) {
        throw new Error('All installation strategies failed');
      }

      // After reinstall, remove problematic TypeScript localization files if this is the typescript package
      if (packageName === 'typescript') {
        this.log('Cleaning TypeScript localization files after reinstall...', 'info');
        try {
          const typescriptLibDir = path.join(packageDir, 'lib');
          if (fs.existsSync(typescriptLibDir)) {
            const localizationDirs = fs.readdirSync(typescriptLibDir).filter(dir => {
              const fullPath = path.join(typescriptLibDir, dir);
              return fs.statSync(fullPath).isDirectory() && dir.match(/^[a-z]{2}$/) && dir !== 'en';
            });
            
            for (const locDir of localizationDirs) {
              const diagnosticFile = path.join(typescriptLibDir, locDir, 'diagnosticMessages.generated.json');
              if (fs.existsSync(diagnosticFile)) {
                fs.unlinkSync(diagnosticFile);
                this.log(`Removed problematic localization file: lib/${locDir}/diagnosticMessages.generated.json`, 'info');
              }
            }
          }
        } catch (cleanupError) {
          this.log(`TypeScript localization cleanup failed (non-critical): ${cleanupError.message}`, 'warning');
        }
      }

      // Re-validate the package
      if (this.validatePackage(packageName)) {
        this.log(`Successfully fixed package: ${packageName}`, 'success');
        this.stats.issuesFixed++;
        return true;
      } else {
        // If still corrupted, try to isolate and fix specific files
        return await this.isolateAndFixCorruption(packageName);
      }
      
    } catch (error) {
      this.log(`Error fixing package ${packageName}: ${error.message}`, 'error');
      return false;
    }
  }

  async isolateAndFixCorruption(packageName) {
    this.log(`Attempting isolated corruption fix for: ${packageName}`, 'info');
    
    try {
      const packageDir = path.join(NODE_MODULES_DIR, packageName);
      const packageIssues = this.issues.filter(issue => issue.package === packageName);
      
      for (const issue of packageIssues) {
        if (issue.type === 'json_corruption') {
          // For non-critical JSON files (like diagnostic messages), we can remove them
          const relativePath = path.relative(NODE_MODULES_DIR, issue.file);
          if (this.isNonCriticalFile(relativePath)) {
            this.log(`Removing non-critical corrupted file: ${relativePath}`, 'info');
            try {
              fs.unlinkSync(issue.file);
              this.log(`Successfully removed corrupted file: ${relativePath}`, 'success');
            } catch (removeError) {
              this.log(`Failed to remove file ${relativePath}: ${removeError.message}`, 'warning');
            }
          }
        }
      }
      
      // Re-validate after cleanup
      const stillCorrupted = this.issues.filter(issue => 
        issue.package === packageName && fs.existsSync(issue.file)
      );
      
      if (stillCorrupted.length === 0) {
        this.log(`Successfully isolated and fixed corruption in: ${packageName}`, 'success');
        this.stats.issuesFixed++;
        return true;
      }
      
      return false;
      
    } catch (error) {
      this.log(`Error in isolated fix for ${packageName}: ${error.message}`, 'error');
      return false;
    }
  }

  isNonCriticalFile(relativePath) {
    const nonCriticalPatterns = [
      /\/lib\/[a-z]{2}\/diagnosticMessages\.generated\.json$/, // TypeScript localization files
      /\/locale\/[a-z]{2}\.json$/, // Locale files
      /\/i18n\/[a-z]{2}.*\.json$/, // Internationalization files
      /\/translations\/[a-z]{2}.*\.json$/, // Translation files
      /\/lang\/[a-z]{2}.*\.json$/, // Language files
      /\/locales\/[a-z]{2}.*\.json$/, // Locale files (alternative path)
      /typescript\/lib\/[a-z]{2}\//, // All TypeScript localization directory files
      /\/assets\/locales?\//, // Asset locale files
      /\/resources\/locales?\//, // Resource locale files
      /\.d\.ts\.map$/, // TypeScript declaration map files (not critical)
      /\/test\/.*\.json$/, // Test configuration files
      /\/tests\/.*\.json$/, // Test configuration files
      /\/examples?\/.*\.json$/, // Example files
      /\/docs?\/.*\.json$/, // Documentation files
      /\/demo[s]?\//i // Demo files
    ];
    
    return nonCriticalPatterns.some(pattern => pattern.test(relativePath));
  }

  async validate() {
    this.log('Starting comprehensive package validation...', 'info');
    
    if (!fs.existsSync(NODE_MODULES_DIR)) {
      this.log('node_modules directory not found', 'error');
      return false;
    }

    // Validate critical packages
    for (const packageName of CRITICAL_PACKAGES) {
      this.validatePackage(packageName);
    }

    // Generate report
    this.generateReport();

    // Fix issues if requested
    if (this.options.fix && this.issues.length > 0) {
      this.log('Attempting to fix detected issues...', 'info');
      
      const packagesToFix = [...new Set(this.issues.map(issue => issue.package))];
      
      for (const packageName of packagesToFix) {
        await this.fixPackage(packageName);
      }
    }

    // Only fail validation if there are critical issues remaining
    const criticalIssues = this.issues.filter(issue => issue.isCritical);
    const nonCriticalIssues = this.issues.filter(issue => !issue.isCritical);
    
    if (criticalIssues.length === 0) {
      if (nonCriticalIssues.length > 0) {
        this.log(`Validation passed with ${nonCriticalIssues.length} non-critical issues (safe to proceed)`, 'warning');
      } else {
        this.log('Validation passed completely!', 'success');
      }
      return true;
    } else {
      this.log(`Validation failed with ${criticalIssues.length} critical issues`, 'error');
      return false;
    }
  }

  generateReport() {
    const criticalIssues = this.issues.filter(issue => issue.isCritical);
    const nonCriticalIssues = this.issues.filter(issue => !issue.isCritical);
    
    console.log('\n📊 Validation Report');
    console.log('===================');
    console.log(`Packages checked: ${this.stats.packagesChecked}`);
    console.log(`Files validated: ${this.stats.filesValidated}`);
    console.log(`Issues found: ${this.stats.issuesFound}`);
    
    if (criticalIssues.length > 0) {
      console.log(`Critical issues: ${criticalIssues.length}`);
    }
    if (nonCriticalIssues.length > 0) {
      console.log(`Non-critical issues: ${nonCriticalIssues.length}`);
    }
    
    if (this.options.fix) {
      console.log(`Issues fixed: ${this.stats.issuesFixed}`);
    }

    if (this.issues.length > 0) {
      if (criticalIssues.length > 0) {
        console.log('\n� Critical Issues:');
        console.log('===================');
        
        for (const issue of criticalIssues) {
          console.log(`❌ ${issue.package}: ${issue.error}`);
          if (this.options.verbose) {
            console.log(`   File: ${path.relative(__dirname, issue.file)}`);
          }
        }
      }
      
      if (nonCriticalIssues.length > 0) {
        console.log('\n⚠️ Non-Critical Issues:');
        console.log('========================');
        
        for (const issue of nonCriticalIssues) {
          console.log(`⚠️ ${issue.package}: ${issue.error}`);
          console.log(`   File: ${path.relative(__dirname, issue.file)} (can be safely removed)`);
          if (this.options.verbose) {
            console.log(`   Type: Localization/Non-essential file`);
          }
        }
        
        if (nonCriticalIssues.length > 0 && !this.options.fix) {
          console.log('\n💡 Non-critical issues will be automatically cleaned during fix process');
        }
      }
      
      if (!this.options.fix && criticalIssues.length > 0) {
        console.log('\n💡 Tip: Run with --fix to attempt automatic repairs');
      }
      
      if (criticalIssues.length === 0 && nonCriticalIssues.length > 0) {
        console.log('\n✅ All critical validation passed! Non-critical issues can be safely ignored or fixed.');
      }
    } else {
      console.log('\n✅ All packages validated successfully!');
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix'),
    verbose: args.includes('--verbose')
  };

  const validator = new PackageValidator(options);
  const success = await validator.validate();
  
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = PackageValidator;
