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
 * Import creators from CSV
 */
async function importCreators(csvFilePath) {
  console.log(`📥 Processing: ${path.basename(csvFilePath)}`);
  
  const creators = [];
  let skipped = 0;
  let lineNumber = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        lineNumber++;
        
        // Validate required fields
        if (!row.ig_handle || !row.name || !row.ig_followers) {
          skipped++;
          return;
        }

        const followers = parseInt(row.ig_followers) || 0;
        
        // Filter by follower count (1K - 2M) as per previous script logic
        if (followers < 1000 || followers > 2000000) {
          skipped++;
          return;
        }

        // Calculate estimated engagement rate
        const estimatedEngagement = (() => {
          if (followers < 10000) return 4.5;
          if (followers < 100000) return 3.2;
          if (followers < 1000000) return 2.1;
          return 1.5;
        })();

        creators.push({
          external_id: row.id?.trim(),
          name: row.name.trim(),
          ig_handle: row.ig_handle.trim().toLowerCase().replace('@', ''),
          ig_followers: followers,
          category: row.category?.trim() || 'Uncategorized',
          subcategory: row.subcategory?.trim() || null,
          engagement_rate: estimatedEngagement,
          verified: followers > 500000,
          bio: `${row.category || 'Creator'} focusing on ${row.subcategory || 'content'}`,
          location: row.location?.trim() || 'India', // Use location from CSV if available
          languages: ['English', 'Hindi'],
          content_style: row.subcategory || row.category || 'General',
          avg_likes: Math.round(followers * (estimatedEngagement / 100)),
          avg_comments: Math.round(followers * (estimatedEngagement / 100) * 0.08),
          avg_views: Math.round(followers * 0.35),
          account_status: 'active'
        });
      })
      .on('end', async () => {
        console.log(`📊 Parsed: ${creators.length} valid creators (Skipped: ${skipped})`);
        
        if (creators.length === 0) {
          return resolve(0);
        }

        const batchSize = 50;
        let imported = 0;
        
        for (let i = 0; i < creators.length; i += batchSize) {
          const batch = creators.slice(i, i + batchSize);
          
          try {
            const { error } = await supabase
              .from('creators')
              .upsert(batch, { 
                onConflict: 'ig_handle',
                ignoreDuplicates: false 
              });
            
            if (error) {
              console.error(`❌ Error in batch ${Math.floor(i/batchSize) + 1}:`, error.message);
            } else {
              imported += batch.length;
            }
          } catch (err) {
            console.error(`❌ Exception in batch ${Math.floor(i/batchSize) + 1}:`, err.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log(`✅ Successfully imported/updated ${imported} creators from ${path.basename(csvFilePath)}`);
        resolve(imported);
      })
      .on('error', (error) => {
        console.error(`❌ Error reading ${path.basename(csvFilePath)}:`, error);
        reject(error);
      });
  });
}

async function run() {
  const dataDir = path.join(__dirname, '..', 'Influencers data');
  const files = [
    'celebrities.csv',
    'meme_pages.csv',
    'publishers.csv',
    'parallel.csv',
    'hashfame.csv'
  ];

  let totalImported = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const count = await importCreators(filePath);
        totalImported += count;
      } catch (err) {
        console.error(`Failed to process ${file}:`, err);
      }
    } else {
      console.warn(`⚠️ File not found: ${filePath}`);
    }
  }

  console.log(`\n🎉 All done! Total imported/updated: ${totalImported} creators.`);
}

run();
