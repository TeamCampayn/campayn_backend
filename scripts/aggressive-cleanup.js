const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Aggressive cleanup for processing large batches
async function aggressiveCleanup(options = {}) {
  const {
    maxProfiles = 500,  // Process up to 500 profiles per run
    batchSize = 25,     // 25 creators per batch
    delayBetweenCalls = 5000,  // 5 seconds between API calls
    delayBetweenBatches = 30000, // 30 seconds between batches
    startOffset = 0
  } = options;

  console.log('🚀 AGGRESSIVE CREATOR CLEANUP');
  console.log('=============================');
  console.log(`⚙️  Settings:`);
  console.log(`   Max profiles per run: ${maxProfiles}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Delay between API calls: ${delayBetweenCalls/1000}s`);
  console.log(`   Delay between batches: ${delayBetweenBatches/1000}s`);
  console.log(`   Starting offset: ${startOffset}`);
  console.log(`⚠️  This will process ${maxProfiles} creators in one run!\n`);

  const stats = {
    total: 0,
    processed: 0,
    valid: 0,
    deleted: 0,
    errors: 0,
    batches: 0,
    startTime: new Date()
  };

  try {
    // Get total count
    const { count } = await supabase
      .from('creators')
      .select('*', { count: 'exact', head: true })
      .not('ig_handle', 'is', null);

    stats.total = count || 0;
    console.log(`📊 Total creators in database: ${stats.total.toLocaleString()}\n`);

    let offset = startOffset;

    while (stats.processed < maxProfiles && offset < stats.total) {
      stats.batches++;
      const batchStartTime = new Date();
      
      console.log(`\n📋 Batch ${stats.batches} (offset: ${offset}, processed: ${stats.processed}/${maxProfiles})`);
      console.log('-'.repeat(60));

      // Get batch of creators
      const { data: creators, error } = await supabase
        .from('creators')
        .select('id, name, ig_handle, category, followers_count')
        .not('ig_handle', 'is', null)
        .or('account_status.is.null,account_status.eq.unknown,account_status.eq.not_found')
        .order('id')
        .range(offset, offset + batchSize - 1);

      if (error) throw error;

      if (creators.length === 0) {
        console.log('✅ No more unvalidated creators found');
        break;
      }

      let batchValid = 0;
      let batchDeleted = 0;

      for (let i = 0; i < creators.length; i++) {
        const creator = creators[i];
        const cleanHandle = creator.ig_handle.replace(/^@/, '').trim();
        
        stats.processed++;
        console.log(`[${i + 1}/${creators.length}] ${creator.name} (@${cleanHandle})`);

        try {
          const fields = encodeURIComponent(`business_discovery.username(${cleanHandle}){username,name,followers_count,media_count}`);
          const url = `https://graph.facebook.com/v19.0/${process.env.IG_BUSINESS_ID}?fields=${fields}&access_token=${process.env.IG_ACCESS_TOKEN}`;
          
          const response = await axios.get(url, { timeout: 10000 });
          const profile = response.data.business_discovery;
          
          if (profile && profile.followers_count !== undefined) {
            console.log(`  ✅ VALID - ${profile.followers_count.toLocaleString()} followers`);
            
            // Update as valid
            await supabase
              .from('creators')
              .update({
                account_status: 'active',
                last_checked: new Date().toISOString(),
                followers_count: profile.followers_count,
                media_count: profile.media_count
              })
              .eq('id', creator.id);

            stats.valid++;
            batchValid++;
          }

        } catch (error) {
          if (error.response?.data?.error) {
            const apiError = error.response.data.error;
            
            if (apiError.code === 110 || apiError.error_subcode === 2207013) {
              console.log(`  🗑️  DELETED - User not found`);
              await deleteCreator(creator.id);
              stats.deleted++;
              batchDeleted++;
            } else if (apiError.code === 4) {
              console.log(`  ⏸️  RATE LIMITED - Pausing for 60 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 60000));
              i--; // Retry this creator
              continue;
            } else {
              console.log(`  ⚠️  API ERROR - ${apiError.message}`);
              stats.errors++;
            }
          } else {
            console.log(`  ⚠️  NETWORK ERROR - ${error.message}`);
            stats.errors++;
          }
        }

        // Delay between API calls
        if (i < creators.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
        }

        // Stop if we've hit the profile limit
        if (stats.processed >= maxProfiles) {
          console.log(`\n⏸️  Reached profile limit of ${maxProfiles}`);
          break;
        }
      }

      const batchTime = ((new Date() - batchStartTime) / 1000).toFixed(1);
      console.log(`\nBatch ${stats.batches} Complete: ✅ ${batchValid} valid, 🗑️ ${batchDeleted} deleted (${batchTime}s)`);

      offset += batchSize;

      // Progress update
      const totalTime = ((new Date() - stats.startTime) / 1000 / 60).toFixed(1);
      const progress = ((stats.processed / stats.total) * 100).toFixed(2);
      const rate = (stats.processed / totalTime).toFixed(1);
      
      console.log(`📈 Progress: ${stats.processed.toLocaleString()}/${stats.total.toLocaleString()} (${progress}%) | ${totalTime}min | ${rate} profiles/min`);

      // Stop if we've hit the profile limit
      if (stats.processed >= maxProfiles) break;

      // Delay between batches to avoid rate limits
      if (stats.processed < maxProfiles && offset < stats.total) {
        console.log(`⏳ Waiting ${delayBetweenBatches/1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

  } catch (error) {
    console.error('\n💥 Cleanup failed:', error);
    throw error;
  }

  // Final summary
  const totalTime = ((new Date() - stats.startTime) / 1000 / 60).toFixed(1);
  const rate = (stats.processed / totalTime).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 AGGRESSIVE CLEANUP COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📊 FINAL STATISTICS:`);
  console.log(`Profiles processed: ${stats.processed.toLocaleString()}`);
  console.log(`✅ Valid profiles: ${stats.valid.toLocaleString()}`);
  console.log(`🗑️  Deleted profiles: ${stats.deleted.toLocaleString()}`);
  console.log(`⚠️  Errors: ${stats.errors.toLocaleString()}`);
  console.log(`📋 Batches: ${stats.batches}`);
  console.log(`⏱️  Total time: ${totalTime} minutes`);
  console.log(`📈 Processing rate: ${rate} profiles/minute`);

  const deletionRate = stats.processed > 0 ? ((stats.deleted / stats.processed) * 100).toFixed(1) : 0;
  console.log(`\n💎 Quality Improvement:`);
  console.log(`Database cleanup rate: ${deletionRate}%`);
  console.log(`Remaining profiles to process: ${(stats.total - (startOffset + stats.processed)).toLocaleString()}`);

  return {
    ...stats,
    nextOffset: startOffset + stats.processed,
    totalTime: totalTime,
    rate: rate
  };
}

// Helper function to delete a creator
async function deleteCreator(creatorId) {
  try {
    const { error } = await supabase
      .from('creators')
      .delete()
      .eq('id', creatorId);
    return !error;
  } catch (error) {
    console.error(`Failed to delete creator ${creatorId}:`, error);
    return false;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const maxProfiles = parseInt(args[0]) || 500;
  const startOffset = parseInt(args[1]) || 0;

  console.log(`Starting aggressive cleanup: ${maxProfiles} profiles from offset ${startOffset}`);
  
  aggressiveCleanup({ maxProfiles, startOffset })
    .then(results => {
      console.log(`\n✅ Next run command: node aggressive-cleanup.js ${maxProfiles} ${results.nextOffset}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { aggressiveCleanup };