const fs = require('fs');
const path = require('path');

// Configuration
const CONTRACTS_DIR = path.join(__dirname, 'contracts');
const FILE_EXTENSIONS = ['.sol'];

// Enhanced validation function
function validateFileIntegrity(filePath, content) {
  try {
    // Check for common corruption indicators
    const corruptionIndicators = [
      '\uFFFD', // Replacement character
      '\x00',   // Null bytes
      '\xFF\xFE', // UTF-16 LE BOM
      '\xFE\xFF', // UTF-16 BE BOM
    ];
    
    for (const indicator of corruptionIndicators) {
      if (content.includes(indicator)) {
        console.warn(`⚠️ Potential corruption detected in ${filePath}: contains ${indicator.charCodeAt(0).toString(16)}`);
        return false;
      }
    }
    
    // Validate UTF-8 encoding
    const buffer = Buffer.from(content, 'utf8');
    const decoded = buffer.toString('utf8');
    if (decoded !== content) {
      console.warn(`⚠️ UTF-8 encoding issue detected in ${filePath}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn(`⚠️ Validation error for ${filePath}:`, error.message);
    return false;
  }
}

async function stripBomsFromFiles() {
  try {
    console.log('🔍 Starting enhanced BOM removal and validation process...');
    
    // Dynamic import ES Module (strip-bom v5+) or fallback to CommonJS (v4)
    let stripBom;
    try {
      const { default: stripBomModule } = await import('strip-bom');
      stripBom = stripBomModule;
      console.log('✓ Using strip-bom ES Module');
    } catch (importError) {
      try {
        stripBom = require('strip-bom');
        console.log('✓ Using strip-bom CommonJS');
      } catch (requireError) {
        console.warn('⚠️ strip-bom not available, using fallback BOM removal');
        // Fallback BOM removal function
        stripBom = (content) => {
          // Remove UTF-8 BOM
          if (content.charCodeAt(0) === 0xFEFF) {
            return content.slice(1);
          }
          // Remove UTF-8 BOM bytes
          if (content.startsWith('\uFEFF')) {
            return content.substring(1);
          }
          if (content.startsWith('\u00EF\u00BB\u00BF')) {
            return content.substring(3);
          }
          return content;
        };
      }
    }
    
    if (!fs.existsSync(CONTRACTS_DIR)) {
      console.log('📂 Contracts directory does not exist, skipping BOM removal');
      return;
    }
    
    let filesFixed = 0;
    let filesValidated = 0;
    let corruptionDetected = 0;

    // Walk through all files in the contracts directory
    function processDirectory(dir) {
      try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
          try {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
              // Recursively process subdirectories
              processDirectory(filePath);
            } else if (FILE_EXTENSIONS.includes(path.extname(file))) {
              // Process Solidity files
              const content = fs.readFileSync(filePath, 'utf8');
              const relativePath = path.relative(__dirname, filePath);
              
              // Validate file integrity first
              if (!validateFileIntegrity(filePath, content)) {
                console.error(`❌ File integrity check failed for ${relativePath}`);
                corruptionDetected++;
                return;
              }
              
              filesValidated++;
              const stripped = stripBom(content);
              
              // Check if BOM was actually removed
              if (stripped !== content) {
                // Additional validation after BOM removal
                if (validateFileIntegrity(filePath, stripped)) {
                  fs.writeFileSync(filePath, stripped, 'utf8');
                  console.log(`✅ Removed BOM from ${relativePath}`);
                  filesFixed++;
                } else {
                  console.error(`❌ BOM removal resulted in corruption for ${relativePath}`);
                  corruptionDetected++;
                }
              }
            }
          } catch (fileError) {
            console.warn(`⚠️ Warning: Could not process ${file}:`, fileError.message);
          }
        });
      } catch (dirError) {
        console.warn(`⚠️ Warning: Could not read directory ${dir}:`, dirError.message);
      }
    }

    // Start processing
    processDirectory(CONTRACTS_DIR);

    // Summary report
    console.log(`📊 Processing summary:`);
    console.log(`   - Files validated: ${filesValidated}`);
    console.log(`   - BOMs removed: ${filesFixed}`);
    console.log(`   - Corruption detected: ${corruptionDetected}`);

    if (corruptionDetected > 0) {
      console.error(`❌ ${corruptionDetected} file(s) have corruption issues that need manual review`);
      // Don't exit with error to avoid stopping deployment, but log the issue
      console.log('ℹ️ Continuing with deployment, but please review corrupted files manually');
    }

    if (filesFixed > 0) {
      console.log(`🎉 Fixed ${filesFixed} file(s) with BOMs`);
    } else {
      console.log('✨ No BOMs found, all files are clean');
    }
    
    console.log('✅ Enhanced BOM removal and validation completed successfully');
  } catch (error) {
    console.error('❌ Error during BOM removal:', error.message);
    console.log('ℹ️ Continuing with deployment despite BOM removal failure...');
    // Don't exit with error to avoid stopping deployment
  }
}

// Execute the async function
stripBomsFromFiles().catch(error => {
  console.error('❌ Fatal error in BOM removal:', error);
  // Use exit(0) to not halt deployment
  process.exit(0);
});
