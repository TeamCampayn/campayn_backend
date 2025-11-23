const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Quick cleanup function for immediate use
async function quickCleanup() {
  console.log('🚀 Quick Invalid Creator Cleanup Starting...\n');

  try {
    // Get first 20 creators with unknown status
    const { data: creators, error } = await supabase
      .from('creators')
      .select('id, name, ig_handle, category')
      .not('ig_handle', 'is', null)
      .or('account_status.is.null,account_status.eq.unknown')
      .order('id')
      .limit(20);

    if (error) throw error;

    console.log(`Found ${creators.length} creators to check\n`);

    let validCount = 0;
    let invalidCount = 0;
    const invalidCreators = [];

    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i];
      const cleanHandle = creator.ig_handle.replace(/^@/, '').trim();
      
      console.log(`[${i + 1}/${creators.length}] Checking: ${creator.name} (@${cleanHandle})`);

      try {
        const fields = encodeURIComponent(`business_discovery.username(${cleanHandle}){username,name,followers_count}`);
        const url = `https://graph.facebook.com/v19.0/${process.env.IG_BUSINESS_ID}?fields=${fields}&access_token=${process.env.IG_ACCESS_TOKEN}`;
        
        const response = await axios.get(url, { timeout: 8000 });
        
        if (response.data.business_discovery) {
          console.log(`  ✅ Valid - ${response.data.business_discovery.followers_count} followers`);
          validCount++;
          
          // Mark as active
          await supabase
            .from('creators')
            .update({ 
              account_status: 'active',
              last_checked: new Date().toISOString()
            })
            .eq('id', creator.id);
        }
      } catch (error) {
        if (error.response?.data?.error) {
          const apiError = error.response.data.error;
          let status = 'not_found';
          
          if (apiError.code === 110 || apiError.error_subcode === 2207013) {
            console.log(`  ❌ Not Found - User doesn't exist`);
            status = 'not_found';
          } else if (apiError.code === 803) {
            console.log(`  🔒 Private - Account is private or restricted`);
            status = 'private';
          } else {
            console.log(`  ⚠️  API Error - ${apiError.message}`);
            status = 'not_found';
          }

          invalidCount++;
          invalidCreators.push({
            ...creator,
            reason: status,
            error: apiError.message
          });

          // Mark as invalid
          await supabase
            .from('creators')
            .update({ 
              account_status: status,
              last_checked: new Date().toISOString()
            })
            .eq('id', creator.id);
        } else {
          console.log(`  ⚠️  Network Error - ${error.message}`);
        }
      }

      // Add delay to avoid rate limiting
      if (i < creators.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 QUICK CLEANUP SUMMARY:');
    console.log(`✅ Valid profiles: ${validCount}`);
    console.log(`❌ Invalid profiles: ${invalidCount}`);
    console.log(`📋 Total processed: ${validCount + invalidCount}`);

    if (invalidCreators.length > 0) {
      console.log('\n❌ INVALID PROFILES FOUND:');
      invalidCreators.forEach((creator, index) => {
        console.log(`${index + 1}. ${creator.name} (@${creator.ig_handle}) - ${creator.reason}`);
      });

      console.log('\n🗑️  To delete these invalid profiles, run:');
      const invalidIds = invalidCreators.map(c => c.id).join(',');
      console.log(`DELETE FROM creators WHERE id IN (${invalidIds});`);
    }

    // Show updated stats
    console.log('\n📈 Updated Database Stats:');
    const { data: stats } = await supabase
      .from('creators')
      .select('account_status')
      .not('ig_handle', 'is', null);

    if (stats) {
      const statusCounts = stats.reduce((acc, creator) => {
        const status = creator.account_status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      Object.entries(statusCounts).forEach(([status, count]) => {
        const percentage = ((count / stats.length) * 100).toFixed(1);
        console.log(`${status}: ${count} (${percentage}%)`);
      });
    }

  } catch (error) {
    console.error('Quick cleanup failed:', error);
  }
}

// Run quick cleanup
quickCleanup();