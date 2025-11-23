#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('🚀 CREATOR DATABASE CLEANUP TOOLKIT');
console.log('====================================\n');

const commands = {
  'stats': {
    description: 'Show current database quality statistics',
    command: 'node database-quality-report.js'
  },
  'delete-obvious': {
    description: 'Delete obviously invalid profiles (test, fake, demo patterns)',
    command: 'node delete-obvious-invalid.js'
  },
  'validate': {
    description: 'Validate creators and mark/delete invalid ones (50 at a time)',
    command: 'node comprehensive-cleanup.js'
  },
  'find-invalid': {
    description: 'Search for invalid creators without making changes',
    command: 'node find-invalid.js'
  },
  'quick-clean': {
    description: 'Quick cleanup of 20 creators for testing',
    command: 'node quick-cleanup.js'
  }
};

const args = process.argv.slice(2);
const action = args[0];

if (!action || !commands[action]) {
  console.log('Available Commands:');
  console.log('==================');
  Object.entries(commands).forEach(([cmd, info]) => {
    console.log(`📌 ${cmd.padEnd(15)} - ${info.description}`);
  });
  
  console.log('\nUsage Examples:');
  console.log('===============');
  console.log('node cleanup-toolkit.js stats          # Show database quality report');
  console.log('node cleanup-toolkit.js delete-obvious # Remove obviously invalid profiles');
  console.log('node cleanup-toolkit.js validate       # Validate 50 creators via Instagram API');
  console.log('node cleanup-toolkit.js find-invalid   # Search for invalid creators');
  
  console.log('\n💡 Recommended Workflow:');
  console.log('========================');
  console.log('1. Run "stats" to see current database state');
  console.log('2. Run "delete-obvious" to remove clearly invalid profiles');
  console.log('3. Run "validate" multiple times to systematically check creators');
  console.log('4. Run "stats" again to see improvements');
  
  console.log('\n⚠️  Important Notes:');
  console.log('===================');
  console.log('• "delete-obvious" and "validate" will PERMANENTLY DELETE invalid profiles');
  console.log('• "validate" processes 50 creators per run to avoid Instagram API rate limits');
  console.log('• Wait 5+ minutes between "validate" runs to respect API limits');
  console.log('• Your database has ~38K creators, full validation will take time');
  
  process.exit(1);
}

// Execute the requested command
const { exec } = require('child_process');
const command = commands[action].command;

console.log(`🎯 Executing: ${commands[action].description}`);
console.log(`📋 Command: ${command}\n`);

exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
  
  if (stderr) {
    console.error(`⚠️  Warning: ${stderr}`);
  }
  
  console.log(stdout);
  
  console.log('\n✅ Command completed successfully!');
  
  // Show next steps based on action
  if (action === 'stats') {
    console.log('\n💡 Next Steps:');
    console.log('• If you see many unknown profiles, run: node cleanup-toolkit.js delete-obvious');
    console.log('• To start validation process, run: node cleanup-toolkit.js validate');
  } else if (action === 'delete-obvious') {
    console.log('\n💡 Next Steps:');
    console.log('• Check results with: node cleanup-toolkit.js stats');
    console.log('• Start Instagram validation: node cleanup-toolkit.js validate');
  } else if (action === 'validate') {
    console.log('\n💡 Next Steps:');
    console.log('• Wait 5+ minutes before running validate again (API rate limits)');
    console.log('• Check progress with: node cleanup-toolkit.js stats');
    console.log('• Continue validation: node cleanup-toolkit.js validate');
  }
});

module.exports = commands;