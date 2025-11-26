const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testRandomRecommendations() {
  console.log('🧪 Testing Random Creator Recommendations\n');
  
  // Test 1: Get recommendations twice for same criteria
  console.log('Test 1: Getting recommendations twice with same criteria...\n');
  
  const testParams = {
    p_category: 'Entertainment',
    p_subcategory: 'Feel-Good News / Stories',
    p_creator_type: 'macro',
    p_limit: 5
  };
  
  // First call
  console.log('📞 First call...');
  const { data: batch1, error: error1 } = await supabase
    .rpc('recommend_creators', testParams);
  
  if (error1) {
    console.error('❌ Error:', error1);
    return;
  }
  
  console.log(`✅ Got ${batch1.length} creators\n`);
  batch1.forEach((c, i) => {
    console.log(`${i+1}. ${c.name} (@${c.ig_handle})`);
    console.log(`   Followers: ${c.ig_followers.toLocaleString()}`);
    console.log(`   Engagement: ${c.engagement_rate?.toFixed(2) || 'N/A'}%`);
    console.log(`   Match Score: ${c.match_score}%\n`);
  });
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Second call
  console.log('📞 Second call (same criteria)...');
  const { data: batch2, error: error2 } = await supabase
    .rpc('recommend_creators', testParams);
  
  if (error2) {
    console.error('❌ Error:', error2);
    return;
  }
  
  console.log(`✅ Got ${batch2.length} creators\n`);
  batch2.forEach((c, i) => {
    console.log(`${i+1}. ${c.name} (@${c.ig_handle})`);
    console.log(`   Followers: ${c.ig_followers.toLocaleString()}`);
    console.log(`   Engagement: ${c.engagement_rate?.toFixed(2) || 'N/A'}%`);
    console.log(`   Match Score: ${c.match_score}%\n`);
  });
  
  // Check if results are different
  const batch1Ids = batch1.map(c => c.id).sort().join(',');
  const batch2Ids = batch2.map(c => c.id).sort().join(',');
  
  if (batch1Ids === batch2Ids) {
    console.log('⚠️  WARNING: Same creators in both batches (randomization may not be working)');
  } else {
    console.log('✅ SUCCESS: Different creators selected (randomization working!)');
  }
  
  // Check engagement rate variety
  const allEngagements = [...batch1, ...batch2].map(c => c.engagement_rate).filter(e => e);
  const uniqueEngagements = new Set(allEngagements.map(e => e.toFixed(2)));
  
  console.log(`\n📊 Engagement Rate Variety:`);
  console.log(`   Total: ${allEngagements.length} creators`);
  console.log(`   Unique rates: ${uniqueEngagements.size}`);
  console.log(`   Range: ${Math.min(...allEngagements).toFixed(2)}% - ${Math.max(...allEngagements).toFixed(2)}%`);
  console.log(`   Average: ${(allEngagements.reduce((a,b) => a+b, 0) / allEngagements.length).toFixed(2)}%`);
  
  if (uniqueEngagements.size === 1) {
    console.log('   ⚠️  All same engagement rate - needs fixing');
  } else {
    console.log('   ✅ Varied engagement rates - working correctly!');
  }
}

testRandomRecommendations();
