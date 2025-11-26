const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Import HashFame creators from CSV
 * CSV Format: id, name, ig_followers, ig_handle, category, subcategory
 */
async function importHashFameCreators(csvFilePath) {
  console.log('📥 HashFame Creator Import Tool');
  console.log('================================\n');
  console.log(`📁 Reading from: ${csvFilePath}\n`);

  const creators = [];
  let skipped = 0;
  let lineNumber = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv()) // Auto-detect separator (comma is default)
      .on('data', (row) => {
        lineNumber++;
        
        // Validate required fields
        if (!row.ig_handle || !row.name || !row.ig_followers) {
          skipped++;
          if (skipped <= 5) {
            console.log(`⏭️  Skipped line ${lineNumber}: Missing required fields`);
          }
          return;
        }

        const followers = parseInt(row.ig_followers) || 0;
        
        // Only import creators in our target range (1K - 2M followers)
        if (followers < 1000 || followers > 2000000) {
          skipped++;
          return;
        }

        // Calculate estimated engagement rate based on follower count
        // General rule: higher followers = lower engagement %
        const estimatedEngagement = (() => {
          if (followers < 10000) return 4.5; // Micro: 4-5%
          if (followers < 100000) return 3.2; // Macro: 2-4%
          if (followers < 1000000) return 2.1; // Mega: 1.5-2.5%
          return 1.5; // Super mega: 1-2%
        })();

        creators.push({
          external_id: row.id?.trim(),
          name: row.name.trim(),
          ig_handle: row.ig_handle.trim().toLowerCase().replace('@', ''),
          ig_followers: followers,
          category: row.category?.trim() || 'Uncategorized',
          subcategory: row.subcategory?.trim() || null,
          engagement_rate: estimatedEngagement,
          verified: followers > 500000, // Auto-verify high-follower creators
          bio: `${row.category} creator${row.subcategory ? ` specializing in ${row.subcategory}` : ''}`,
          location: 'India', // Default location for HashFame dataset
          languages: ['English', 'Hindi'],
          content_style: row.subcategory || row.category,
          avg_likes: Math.round(followers * (estimatedEngagement / 100)),
          avg_comments: Math.round(followers * (estimatedEngagement / 100) * 0.08),
          avg_views: Math.round(followers * 0.35), // ~35% of followers see content
          account_status: 'active'
        });
      })
      .on('end', async () => {
        console.log(`\n📊 Parsing Complete!`);
        console.log(`   ✅ Valid creators: ${creators.length}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        
        if (creators.length === 0) {
          console.log('\n⚠️  No valid creators to import');
          return resolve(0);
        }

        // Show sample of what will be imported
        console.log(`\n📋 Sample Creator (first one):`);
        console.log(JSON.stringify(creators[0], null, 2));
        console.log(`\n🚀 Starting import of ${creators.length} creators...\n`);

        // Insert in batches of 50 to avoid timeout
        const batchSize = 50;
        let imported = 0;
        let errors = 0;
        let duplicates = 0;
        
        for (let i = 0; i < creators.length; i += batchSize) {
          const batch = creators.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(creators.length / batchSize);
          
          try {
            const { data, error } = await supabase
              .from('creators')
              .upsert(batch, { 
                onConflict: 'ig_handle',
                ignoreDuplicates: false 
              });
            
            if (error) {
              if (error.message.includes('duplicate') || error.code === '23505') {
                duplicates += batch.length;
                console.log(`⚠️  Batch ${batchNum}/${totalBatches}: Duplicates found, updated existing`);
              } else {
                console.error(`❌ Batch ${batchNum}/${totalBatches} Error:`, error.message);
                errors++;
              }
            } else {
              imported += batch.length;
              console.log(`✅ Batch ${batchNum}/${totalBatches}: ${imported}/${creators.length} creators`);
            }
          } catch (err) {
            console.error(`❌ Batch ${batchNum}/${totalBatches} Exception:`, err.message);
            errors++;
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`\n🎉 Import Complete!`);
        console.log(`   ✅ Successfully imported/updated: ${imported}`);
        console.log(`   🔄 Duplicates handled: ${duplicates}`);
        console.log(`   ❌ Errors: ${errors}`);
        console.log(`   ⏭️  Skipped (out of range): ${skipped}`);
        
        // Get category summary
        console.log(`\n📊 Fetching category summary...`);
        const { data: categories } = await supabase
          .from('creator_categories_summary')
          .select('*')
          .limit(10);
        
        if (categories && categories.length > 0) {
          console.log(`\n🏷️  Top Categories:`);
          categories.forEach(cat => {
            console.log(`   ${cat.category}: ${cat.creator_count} creators (${cat.micro_count} micro, ${cat.macro_count} macro, ${cat.mega_count} mega)`);
          });
        }
        
        resolve(imported);
      })
      .on('error', (error) => {
        console.error('\n❌ CSV Reading Error:', error);
        reject(error);
      });
  });
}

// CLI Usage
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('❌ Error: Please provide CSV file path\n');
  console.log('Usage: node import-hashfame-creators.js <path-to-csv>');
  console.log('Example: node import-hashfame-creators.js ../hashfame.csv');
  console.log('         node import-hashfame-creators.js /Users/username/Downloads/hashfame.csv\n');
  process.exit(1);
}

if (!fs.existsSync(csvFilePath)) {
  console.error(`❌ Error: File not found: ${csvFilePath}\n`);
  process.exit(1);
}

// Run the import
importHashFameCreators(csvFilePath)
  .then((count) => {
    console.log(`\n✨ All done! Imported ${count} creators.\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
  });
