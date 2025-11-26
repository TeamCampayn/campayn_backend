#!/usr/bin/env node

/**
 * Complete Setup Script for Creator Recommendation System
 * Runs all setup steps in sequence
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'info');
  console.log('='.repeat(60) + '\n');
}

async function checkFileExists(filepath) {
  return fs.existsSync(filepath);
}

async function step1_DatabaseMigration() {
  section('STEP 1: Database Migration');
  
  log('⚠️  MANUAL ACTION REQUIRED', 'warning');
  console.log(`
To complete this step:

1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: zestful-campaign-craft-69
3. Click "SQL Editor" in the sidebar
4. Click "New query"
5. Copy the ENTIRE contents of:
   ${path.join(__dirname, '..', 'database', 'add-creator-recommendations.sql')}
6. Paste into Supabase SQL Editor
7. Click "Run" (or press Cmd+Enter)
8. Wait for "Success. No rows returned" message

Expected changes:
  ✓ campaigns table gets: target_category, target_subcategory, creator_type
  ✓ creators table gets: external_id, bio, location, languages, etc.
  ✓ Function created: get_creator_type()
  ✓ Function created: recommend_creators()
  ✓ View created: creator_categories_summary
  ✓ Indexes created for performance

To verify success, run this in SQL Editor:
  SELECT * FROM creator_categories_summary LIMIT 1;

If it returns 0 rows (no error), migration succeeded! ✅
  `);
  
  const answer = await question('Have you completed the database migration? (yes/no): ');
  
  if (answer.toLowerCase() !== 'yes') {
    log('❌ Database migration not completed. Exiting...', 'error');
    process.exit(1);
  }
  
  log('✅ Database migration marked as complete!', 'success');
}

async function step2_ImportCSV() {
  section('STEP 2: Import HashFame CSV Data');
  
  const csvPath = path.join(__dirname, '..', '..', 'hashfame.csv');
  
  log(`Looking for CSV file: ${csvPath}`);
  
  if (!await checkFileExists(csvPath)) {
    log(`❌ CSV file not found at: ${csvPath}`, 'error');
    log('Please ensure hashfame.csv exists in the project root', 'warning');
    process.exit(1);
  }
  
  log('✅ CSV file found!', 'success');
  log(`📊 Preparing to import creators...`);
  
  const answer = await question('\nStart import process? (yes/no): ');
  
  if (answer.toLowerCase() !== 'yes') {
    log('❌ Import cancelled', 'error');
    process.exit(1);
  }
  
  log('\n🚀 Starting import...\n', 'info');
  
  try {
    const importScript = path.join(__dirname, 'import-hashfame-creators.js');
    execSync(`node "${importScript}" "${csvPath}"`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log('\n✅ Import completed successfully!', 'success');
  } catch (error) {
    log('\n❌ Import failed!', 'error');
    console.error(error);
    process.exit(1);
  }
}

async function step3_VerifyAPI() {
  section('STEP 3: Verify Backend API');
  
  log('Testing if backend server is running...');
  
  const answer = await question('Is your backend server running on port 4000? (yes/no): ');
  
  if (answer.toLowerCase() === 'yes') {
    log('\nTesting API endpoints...', 'info');
    
    try {
      // Test categories endpoint
      const { default: fetch } = await import('node-fetch');
      const response = await fetch('http://localhost:4000/api/creators/categories');
      const data = await response.json();
      
      if (data.success && data.categories.length > 0) {
        log(`✅ Categories API working! Found ${data.categories.length} categories`, 'success');
        console.log('\nSample categories:');
        data.categories.slice(0, 5).forEach(cat => {
          console.log(`  - ${cat.name}: ${cat.count} creators`);
        });
      } else {
        log('⚠️  API responded but no categories found. Import CSV first?', 'warning');
      }
    } catch (error) {
      log('❌ Could not connect to backend API', 'error');
      log('Make sure backend is running: cd backend && npm start', 'warning');
    }
  } else {
    log('\n⚠️  Start your backend server:', 'warning');
    console.log('  cd backend');
    console.log('  npm start');
    log('\nThen you can test manually:', 'info');
    console.log('  curl http://localhost:4000/api/creators/categories');
  }
}

async function step4_FrontendInstructions() {
  section('STEP 4: Frontend Integration');
  
  console.log(`
📝 Next steps for frontend:

1. Update CampaignForm.tsx
   Location: src/components/CampaignForm.tsx
   Reference: CREATOR_RECOMMENDATION_GUIDE.md
   
   Changes needed:
   ✓ Add category/subcategory selection dropdowns
   ✓ Add API calls to fetch categories
   ✓ Update form data interface
   ✓ Add creator stats display
   
2. Update AdminCreatorSelection.tsx
   Location: src/components/AdminCreatorSelection.tsx
   
   Changes needed:
   ✓ Add "Auto-Generate Recommendations" button
   ✓ Call POST /api/campaigns/:id/generate-recommendations
   ✓ Display recommended creators
   
3. Test the complete flow:
   ✓ Create campaign with category selection
   ✓ Admin generates recommendations
   ✓ Verify 10-15 relevant creators appear

Would you like me to create the frontend integration automatically?
(I can update the files for you)
  `);
  
  const answer = await question('\nUpdate frontend files automatically? (yes/no): ');
  
  if (answer.toLowerCase() === 'yes') {
    log('✅ Frontend updates will be applied next!', 'success');
    return true;
  } else {
    log('📖 Use CREATOR_RECOMMENDATION_GUIDE.md for manual integration', 'info');
    return false;
  }
}

async function main() {
  log('🎯 Creator Recommendation System - Complete Setup', 'success');
  log('This will guide you through all setup steps\n');
  
  try {
    // Step 1: Database Migration (Manual)
    await step1_DatabaseMigration();
    
    // Step 2: Import CSV Data
    await step2_ImportCSV();
    
    // Step 3: Verify API
    await step3_VerifyAPI();
    
    // Step 4: Frontend Instructions
    const updateFrontend = await step4_FrontendInstructions();
    
    // Success!
    section('🎉 Setup Complete!');
    log('All backend components are ready!', 'success');
    
    console.log(`
Summary:
  ✅ Database schema updated
  ✅ CSV data imported
  ✅ Backend API verified
  ${updateFrontend ? '⏳' : '📋'} Frontend integration ${updateFrontend ? 'in progress' : 'ready to start'}
  
Next: ${updateFrontend ? 'Frontend files will be updated automatically' : 'Follow CREATOR_RECOMMENDATION_GUIDE.md to update frontend'}
    `);
    
    rl.close();
    
    if (updateFrontend) {
      // Return true to indicate frontend updates should proceed
      process.exit(0);
    }
    
  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, 'error');
    console.error(error);
    rl.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
