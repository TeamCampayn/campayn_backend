const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Test the improved insights endpoint
async function testInsights() {
  console.log('🧪 Testing Instagram Insights API Improvements');
  console.log('==============================================\n');

  const testProfiles = [
    'priyankachopra',    // Major celebrity (should have video content)
    'rajkummar_rao',     // Bollywood actor
    'themermaidscales'   // Lifestyle influencer
  ];

  for (const username of testProfiles) {
    try {
      console.log(`\n📊 Testing: @${username}`);
      console.log('-'.repeat(40));

      const response = await axios.get(`http://localhost:4000/api/insights`, {
        params: { username },
        timeout: 30000
      });

      const data = response.data;
      
      if (data.profile && data.metrics) {
        console.log(`✅ Profile: ${data.profile.name}`);
        console.log(`👥 Followers: ${data.profile.followers_count?.toLocaleString() || 'N/A'}`);
        console.log(`💝 Engagement Rate: ${data.metrics.engagementRate?.toFixed(2) || 'N/A'}%`);
        console.log(`👍 Avg Likes: ${data.metrics.avgLikes?.toLocaleString() || 'N/A'}`);
        console.log(`💬 Avg Comments: ${data.metrics.avgComments?.toLocaleString() || 'N/A'}`);
        
        // Test the improved avgViews
        if (data.metrics.avgViews && data.metrics.avgViews > 0) {
          console.log(`👀 Avg Views: ${data.metrics.avgViews.toLocaleString()} ✅ (Fixed!)`);
        } else {
          console.log(`👀 Avg Views: N/A ⚠️ (Still no video data)`);
        }
        
        // Test the improved growth metrics
        if (data.metrics.growth) {
          const growth7d = data.metrics.growth.percentChange7d;
          const growth30d = data.metrics.growth.percentChange30d;
          
          if (growth7d !== null && growth7d !== undefined) {
            console.log(`📈 7-day Growth: ${growth7d > 0 ? '+' : ''}${growth7d.toFixed(2)}% ✅ (Fixed!)`);
          } else {
            console.log(`📈 7-day Growth: N/A ⚠️ (Still no data)`);
          }
          
          if (growth30d !== null && growth30d !== undefined) {
            console.log(`📈 30-day Growth: ${growth30d > 0 ? '+' : ''}${growth30d.toFixed(2)}% ✅ (Fixed!)`);
          } else {
            console.log(`📈 30-day Growth: N/A ⚠️ (Still no data)`);
          }
        }
        
        // Test active follower estimate
        if (data.metrics.activeFollowerEstimate && data.metrics.activeFollowerEstimate > 0) {
          const percentage = (data.metrics.activeFollowerEstimate * 100).toFixed(1);
          console.log(`🎯 Active Followers: ${percentage}% ✅`);
        } else {
          console.log(`🎯 Active Followers: N/A ⚠️`);
        }
        
      } else {
        console.log(`❌ Invalid response structure`);
      }
      
    } catch (error) {
      console.log(`❌ Error testing ${username}:`, error.message);
    }
  }

  console.log('\n🎉 Test Complete!');
  console.log('\n💡 Expected Improvements:');
  console.log('• Avg Views should now show estimated values instead of N/A');
  console.log('• Growth metrics should show estimated values for profiles without history');
  console.log('• Frontend should display "Limited Access" instead of "N/A" for better UX');
}

// Run the test
if (require.main === module) {
  testInsights()
    .then(() => {
      console.log('\n✅ All tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testInsights };