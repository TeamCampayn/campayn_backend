const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Comprehensive cleanup that removes invalid profiles
async function comprehensiveCleanup() {
  console.log('🧹 COMPREHENSIVE INVALID PROFILE CLEANUP');
  console.log('========================================');
  console.log('This will DELETE invalid profiles from the database!\n');

  const stats = {
    total: 0,
    processed: 0,
    valid: 0,
    deleted: 0,
    errors: 0,
    batches: 0
  };

  try {
    // Get total count first
    const { count } = await supabase
      .from('creators')
      .select('*', { count: 'exact', head: true })
      .not('ig_handle', 'is', null);

    stats.total = count || 0;
    console.log(`📊 Total creators with Instagram handles: ${stats.total}\n`);

    let offset = 0;
    const batchSize = 30;
    let consecutiveValid = 0; // Track consecutive valid profiles to skip high-quality sections

    while (offset < stats.total) {
      stats.batches++;
      console.log(`\n📋 Processing Batch ${stats.batches} (offset: ${offset})`);
      console.log('-'.repeat(50));

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

        // Skip if handle looks invalid
        if (cleanHandle.length < 2 || /^(test|fake|demo|unknown|null|undefined)/.test(cleanHandle.toLowerCase())) {
          console.log(`  🗑️  DELETED - Invalid handle format`);
          await deleteCreator(creator.id);
          stats.deleted++;
          batchDeleted++;
          continue;
        }

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
            consecutiveValid++;
          } else {
            throw new Error('No profile data returned');
          }

        } catch (error) {
          consecutiveValid = 0; // Reset consecutive counter
          
          if (error.response?.data?.error) {
            const apiError = error.response.data.error;
            
            if (apiError.code === 110 || apiError.error_subcode === 2207013) {
              console.log(`  🗑️  DELETED - User not found`);
              await deleteCreator(creator.id);
              stats.deleted++;
              batchDeleted++;
            } else if (apiError.code === 803) {
              console.log(`  🔒 PRIVATE - Marking as private`);
              await supabase
                .from('creators')
                .update({
                  account_status: 'private',
                  last_checked: new Date().toISOString()
                })
                .eq('id', creator.id);
            } else if (apiError.code === 4) {
              console.log(`  ⏸️  RATE LIMITED - Pausing...`);
              await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
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

        // Add delay between API calls
        if (i < creators.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }

      console.log(`\nBatch ${stats.batches} Summary: ✅ ${batchValid} valid, 🗑️ ${batchDeleted} deleted`);

      // If we have many consecutive valid profiles, skip ahead to avoid wasting API calls
      if (consecutiveValid > 50) {
        console.log(`\n⏩ Skipping ahead due to ${consecutiveValid} consecutive valid profiles...`);
        offset += 500; // Skip ahead
        consecutiveValid = 0;
      } else {
        offset += batchSize;
      }

      // Progress update
      const progress = ((stats.processed / stats.total) * 100).toFixed(1);
      console.log(`\n📈 Overall Progress: ${stats.processed}/${stats.total} (${progress}%)`);
      console.log(`📊 Stats: ✅ ${stats.valid} valid, 🗑️ ${stats.deleted} deleted, ⚠️ ${stats.errors} errors`);

      // Stop if we've processed enough for now
      if (stats.processed >= 100) { // Limit to 100 profiles per run to avoid rate limits
        console.log('\n⏸️  Stopping at 100 processed profiles to avoid rate limits');
        console.log('   Run the script again to continue cleanup');
        break;
      }
    }

  } catch (error) {
    console.error('\n💥 Cleanup failed:', error);
    throw error;
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 CLEANUP COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📊 FINAL STATISTICS:`);
  console.log(`Total creators checked: ${stats.total}`);
  console.log(`Profiles processed: ${stats.processed}`);
  console.log(`✅ Valid profiles: ${stats.valid}`);
  console.log(`🗑️  Deleted profiles: ${stats.deleted}`);
  console.log(`⚠️  Errors encountered: ${stats.errors}`);
  console.log(`📋 Batches processed: ${stats.batches}`);

  // Show database improvement
  const deletionRate = stats.deleted > 0 ? ((stats.deleted / stats.processed) * 100).toFixed(1) : 0;
  console.log(`\n📈 Database Quality Improvement:`);
  console.log(`- Removed ${stats.deleted} invalid profiles`);
  console.log(`- Deletion rate: ${deletionRate}% of processed profiles`);
  console.log(`- ${stats.valid} profiles confirmed as active`);

  if (stats.deleted > 0) {
    console.log(`\n💾 Database freed up space by removing ${stats.deleted} invalid entries`);
  }

  return stats;
}

// Helper function to delete a creator
async function deleteCreator(creatorId) {
  try {
    const { error } = await supabase
      .from('creators')
      .delete()
      .eq('id', creatorId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Failed to delete creator ${creatorId}:`, error);
    return false;
  }
}

// Run the comprehensive cleanup
if (require.main === module) {
  comprehensiveCleanup()
    .then(stats => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { comprehensiveCleanup };