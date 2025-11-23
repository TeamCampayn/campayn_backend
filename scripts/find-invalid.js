const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Function to find invalid creators by testing random samples
async function findInvalidCreators() {
  console.log('🔍 Searching for invalid creators in database...\n');

  try {
    // Get random sample of creators
    const { data: creators, error } = await supabase
      .from('creators')
      .select('id, name, ig_handle, category')
      .not('ig_handle', 'is', null)
      .or('account_status.is.null,account_status.eq.unknown')
      .order('id')
      .range(500, 550); // Try a different range

    if (error) throw error;

    console.log(`Testing ${creators.length} creators from offset 500...\n`);

    let validCount = 0;
    let invalidCount = 0;
    const invalidCreators = [];

    for (let i = 0; i < Math.min(creators.length, 15); i++) { // Test only 15 to save API calls
      const creator = creators[i];
      const cleanHandle = creator.ig_handle.replace(/^@/, '').trim();
      
      console.log(`[${i + 1}/15] Testing: ${creator.name} (@${cleanHandle})`);

      try {
        const fields = encodeURIComponent(`business_discovery.username(${cleanHandle}){username,name,followers_count}`);
        const url = `https://graph.facebook.com/v19.0/${process.env.IG_BUSINESS_ID}?fields=${fields}&access_token=${process.env.IG_ACCESS_TOKEN}`;
        
        const response = await axios.get(url, { timeout: 8000 });
        
        if (response.data.business_discovery) {
          console.log(`  ✅ Valid - ${response.data.business_discovery.followers_count} followers`);
          validCount++;
        }
      } catch (error) {
        if (error.response?.data?.error) {
          const apiError = error.response.data.error;
          
          if (apiError.code === 110 || apiError.error_subcode === 2207013) {
            console.log(`  ❌ INVALID - User not found`);
            invalidCount++;
            invalidCreators.push({
              ...creator,
              reason: 'not_found',
              error: apiError.message
            });
          } else if (apiError.code === 803) {
            console.log(`  🔒 Private account`);
            invalidCount++;
            invalidCreators.push({
              ...creator,
              reason: 'private',
              error: apiError.message
            });
          } else {
            console.log(`  ⚠️  API Error - ${apiError.message}`);
          }
        } else {
          console.log(`  ⚠️  Network Error - ${error.message}`);
        }
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n' + '='.repeat(50));
    console.log('🔍 SAMPLE TEST RESULTS:');
    console.log(`✅ Valid profiles: ${validCount}`);
    console.log(`❌ Invalid profiles: ${invalidCount}`);

    if (invalidCreators.length > 0) {
      console.log('\n❌ INVALID PROFILES FOUND:');
      invalidCreators.forEach((creator, index) => {
        console.log(`${index + 1}. ${creator.name} (@${creator.ig_handle}) - ${creator.reason}`);
      });
    } else {
      console.log('\n🎉 No invalid profiles found in this sample!');
      console.log('Your database seems to have high-quality data.');
    }

    // Let's also check for obviously invalid handles
    console.log('\n🔍 Checking for obviously invalid handles...');
    
    const { data: suspiciousHandles } = await supabase
      .from('creators')
      .select('id, name, ig_handle')
      .not('ig_handle', 'is', null)
      .or('ig_handle.like.%test%,ig_handle.like.%fake%,ig_handle.like.%demo%,ig_handle.like.%123%,ig_handle.like.%000%')
      .limit(10);

    if (suspiciousHandles && suspiciousHandles.length > 0) {
      console.log('⚠️  Found suspicious handles:');
      suspiciousHandles.forEach(creator => {
        console.log(`  - ${creator.name} (@${creator.ig_handle})`);
      });
    } else {
      console.log('✅ No obviously suspicious handles found');
    }

  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Run the search
findInvalidCreators();