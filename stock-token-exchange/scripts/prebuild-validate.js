#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { CompilerManager } = require('./ensure-compiler');

/**
 * Pre-build validation script
 * Ensures all dependencies and configurations are ready before building
 */
class PreBuildValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  log(message) {
    console.log(`🔍 ${message}`);
  }

  error(message) {
    this.errors.push(message);
    console.error(`❌ ${message}`);
  }

  warn(message) {
    this.warnings.push(message);
    console.warn(`⚠️ ${message}`);
  }

  success(message) {
    console.log(`✅ ${message}`);
  }

  /**
   * Validate Node.js and npm versions
   */
  validateNodeEnvironment() {
    this.log('Validating Node.js environment...');
    
    try {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      if (majorVersion < 16) {
        this.error(`Node.js version ${nodeVersion} is too old. Minimum required: 16.x`);
      } else {
        this.success(`Node.js version ${nodeVersion} is compatible`);
      }
    } catch (error) {
      this.error(`Failed to check Node.js version: ${error.message}`);
    }
  }

  /**
   * Validate package.json and dependencies
   */
  validatePackageConfiguration() {
    this.log('Validating package configuration...');
    
    try {
      if (!fs.existsSync('./package.json')) {
        this.error('package.json not found');
        return;
      }

      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      
      // Check for required dependencies
      const requiredDeps = ['hardhat', '@nomicfoundation/hardhat-toolbox'];
      const missingDeps = requiredDeps.filter(dep => 
        !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      );

      if (missingDeps.length > 0) {
        this.error(`Missing required dependencies: ${missingDeps.join(', ')}`);
      } else {
        this.success('Required dependencies found');
      }

      // Check for build script
      if (!packageJson.scripts?.build) {
        this.error('Build script not found in package.json');
      } else {
        this.success('Build script found');
      }

    } catch (error) {
      this.error(`Failed to validate package.json: ${error.message}`);
    }
  }

  /**
   * Validate Hardhat configuration
   */
  validateHardhatConfiguration() {
    this.log('Validating Hardhat configuration...');
    
    const configFiles = ['hardhat.config.ts', 'hardhat.config.js'];
    const configFile = configFiles.find(file => fs.existsSync(file));
    
    if (!configFile) {
      this.error('Hardhat config file not found');
      return;
    }

    try {
      const configContent = fs.readFileSync(configFile, 'utf8');
      
      // Check for Solidity version
      if (!configContent.includes('solidity')) {
        this.warn('Solidity version not explicitly configured');
      } else {
        this.success('Solidity configuration found');
      }

      // Check for networks configuration
      if (!configContent.includes('networks')) {
        this.warn('Networks configuration not found');
      } else {
        this.success('Networks configuration found');
      }

    } catch (error) {
      this.error(`Failed to validate Hardhat config: ${error.message}`);
    }
  }

  /**
   * Validate contract files
   */
  validateContracts() {
    this.log('Validating contract files...');
    
    const contractsDir = './contracts';
    
    if (!fs.existsSync(contractsDir)) {
      this.error('Contracts directory not found');
      return;
    }

    try {
      const files = fs.readdirSync(contractsDir);
      const solFiles = files.filter(file => file.endsWith('.sol'));
      
      if (solFiles.length === 0) {
        this.error('No Solidity files found in contracts directory');
      } else {
        this.success(`Found ${solFiles.length} Solidity file(s)`);
        
        // Check for common contract issues
        for (const file of solFiles) {
          const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
          
          if (!content.includes('pragma solidity')) {
            this.warn(`${file}: Missing pragma solidity directive`);
          }
          
          if (content.includes('console.log') && !content.includes('import "hardhat/console.sol"')) {
            this.warn(`${file}: console.log used without proper import`);
          }
        }
      }
    } catch (error) {
      this.error(`Failed to validate contracts: ${error.message}`);
    }
  }

  /**
   * Validate node_modules and dependencies
   */
  validateDependencies() {
    this.log('Validating installed dependencies...');
    
    if (!fs.existsSync('./node_modules')) {
      this.error('node_modules directory not found - run npm install first');
      return;
    }

    try {
      // Check for Hardhat installation via npx (more reliable)
      const { execSync } = require('child_process');
      try {
        execSync('npx hardhat --version', { stdio: 'pipe' });
        this.success('Hardhat installation found (via npx)');
      } catch (error) {
        this.error('Hardhat not accessible via npx');
      }

      // Check for TypeScript if using .ts config
      if (fs.existsSync('./hardhat.config.ts')) {
        try {
          execSync('npx tsc --version', { stdio: 'pipe' });
          this.success('TypeScript installation found');
        } catch (error) {
          this.warn('TypeScript not found but .ts config file exists');
        }
      }

    } catch (error) {
      this.error(`Failed to validate dependencies: ${error.message}`);
    }
  }

  /**
   * Validate write permissions and directories
   */
  validatePermissions() {
    this.log('Validating write permissions...');
    
    const requiredDirs = ['./cache', './artifacts'];
    
    for (const dir of requiredDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          this.success(`Created directory: ${dir}`);
        }
        
        // Test write permission
        const testFile = path.join(dir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        
        this.success(`Write permission confirmed: ${dir}`);
      } catch (error) {
        this.error(`Write permission failed for ${dir}: ${error.message}`);
      }
    }
  }

  /**
   * Run all validations
   */
  async runAllValidations() {
    console.log('🚀 Starting pre-build validation...');
    console.log('');

    this.validateNodeEnvironment();
    this.validatePackageConfiguration();
    this.validateHardhatConfiguration();
    this.validateContracts();
    this.validateDependencies();
    this.validatePermissions();

    // Run compiler validation
    try {
      this.log('Validating Solidity compiler availability...');
      const compilerManager = new CompilerManager();
      const compilerReady = await compilerManager.ensureCompiler();
      
      if (compilerReady) {
        this.success('Solidity compiler is ready');
      } else {
        this.error('Solidity compiler validation failed');
      }
    } catch (error) {
      this.error(`Compiler validation error: ${error.message}`);
    }

    // Summary
    console.log('');
    console.log('📋 Validation Summary:');
    
    if (this.errors.length > 0) {
      console.log(`❌ Errors: ${this.errors.length}`);
      this.errors.forEach(error => console.log(`   • ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log(`⚠️ Warnings: ${this.warnings.length}`);
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    if (this.errors.length === 0) {
      console.log('✅ All validations passed!');
      console.log('🎯 Build process can proceed safely');
      return true;
    } else {
      console.log('💥 Validation failed - build may encounter issues');
      return false;
    }
  }
}

// Main execution
async function main() {
  const validator = new PreBuildValidator();
  const isVerbose = process.argv.includes('--verbose');
  
  if (!isVerbose) {
    // Suppress detailed compiler logs in non-verbose mode
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(' ');
      if (!message.includes('🔧') && !message.includes('🔄') && !message.includes('📦')) {
        originalLog(...args);
      }
    };
  }
  
  try {
    const success = await validator.runAllValidations();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('💥 Validation failed with error:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { PreBuildValidator };

// Run if called directly
if (require.main === module) {
  main();
}
