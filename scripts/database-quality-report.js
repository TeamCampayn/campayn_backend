const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Show comprehensive database quality report
async function showDatabaseQuality() {
  console.log('📊 DATABASE QUALITY REPORT');
  console.log('=' .repeat(50));
  console.log(`Generated: ${new Date().toLocaleString()}\n`);

  try {
    // Get total statistics
    const { data: allCreators, error } = await supabase
      .from('creators')
      .select('id, name, ig_handle, account_status, engagement_rate, followers_count, last_checked, category')
      .not('ig_handle', 'is', null);

    if (error) throw error;

    const stats = {
      total: allCreators.length,
      validated: allCreators.filter(c => c.last_checked).length,
      pending: allCreators.filter(c => !c.last_checked).length,
      active: allCreators.filter(c => c.account_status === 'active').length,
      inactive: allCreators.filter(c => c.account_status === 'inactive').length,
      not_found: allCreators.filter(c => c.account_status === 'not_found').length,
      private: allCreators.filter(c => c.account_status === 'private').length,
      unknown: allCreators.filter(c => !c.account_status || c.account_status === 'unknown').length
    };

    // Calculate quality metrics
    const validationRate = ((stats.validated / stats.total) * 100).toFixed(1);
    const activeRate = stats.validated > 0 ? ((stats.active / stats.validated) * 100).toFixed(1) : 0;
    const qualityScore = stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0;

    console.log('🎯 OVERVIEW');
    console.log('-'.repeat(25));
    console.log(`Total Creators: ${stats.total.toLocaleString()}`);
    console.log(`Validation Progress: ${stats.validated.toLocaleString()} / ${stats.total.toLocaleString()} (${validationRate}%)`);
    console.log(`Database Quality Score: ${qualityScore}% active creators`);
    console.log();

    console.log('📈 VALIDATION STATUS');
    console.log('-'.repeat(25));
    console.log(`✅ Active: ${stats.active.toLocaleString()} (${((stats.active/stats.total)*100).toFixed(1)}%)`);
    console.log(`❓ Unknown: ${stats.unknown.toLocaleString()} (${((stats.unknown/stats.total)*100).toFixed(1)}%)`);
    console.log(`💤 Inactive: ${stats.inactive.toLocaleString()} (${((stats.inactive/stats.total)*100).toFixed(1)}%)`);
    console.log(`🔒 Private: ${stats.private.toLocaleString()} (${((stats.private/stats.total)*100).toFixed(1)}%)`);
    console.log(`❌ Not Found: ${stats.not_found.toLocaleString()} (${((stats.not_found/stats.total)*100).toFixed(1)}%)`);
    console.log(`⏳ Pending: ${stats.pending.toLocaleString()} (${((stats.pending/stats.total)*100).toFixed(1)}%)`);
    console.log();

    // Top categories
    const categories = allCreators.reduce((acc, creator) => {
      if (creator.category) {
        acc[creator.category] = (acc[creator.category] || 0) + 1;
      }
      return acc;
    }, {});

    const topCategories = Object.entries(categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    console.log('🏷️  TOP CATEGORIES');
    console.log('-'.repeat(25));
    topCategories.forEach(([category, count], index) => {
      const percentage = ((count / stats.total) * 100).toFixed(1);
      console.log(`${index + 1}. ${category}: ${count} (${percentage}%)`);
    });
    console.log();

    // Sample active creators
    const activeCreators = allCreators
      .filter(c => c.account_status === 'active' && c.followers_count)
      .sort((a, b) => (b.followers_count || 0) - (a.followers_count || 0))
      .slice(0, 10);

    if (activeCreators.length > 0) {
      console.log('🌟 TOP ACTIVE CREATORS');
      console.log('-'.repeat(25));
      activeCreators.forEach((creator, index) => {
        const followers = creator.followers_count >= 1000000 
          ? `${(creator.followers_count / 1000000).toFixed(1)}M`
          : creator.followers_count >= 1000 
          ? `${(creator.followers_count / 1000).toFixed(1)}K`
          : creator.followers_count?.toLocaleString() || 'N/A';
        
        console.log(`${index + 1}. ${creator.name} (@${creator.ig_handle}) - ${followers} followers`);
      });
      console.log();
    }

    // Recommendations
    console.log('💡 RECOMMENDATIONS');
    console.log('-'.repeat(25));
    
    if (stats.pending > 1000) {
      console.log(`🔍 Continue validation: ${stats.pending.toLocaleString()} creators need validation`);
      console.log(`   Run: node comprehensive-cleanup.js`);
    }
    
    if (stats.not_found > 0) {
      console.log(`🗑️  Clean invalid profiles: ${stats.not_found} profiles marked as not_found can be deleted`);
      console.log(`   Run: DELETE FROM creators WHERE account_status = 'not_found';`);
    }
    
    if (stats.active > 100 && stats.validated > 200) {
      console.log(`🎯 Quality is good! You have ${stats.active} validated active creators`);
      console.log(`   Consider implementing engagement-based ranking now`);
    }

    if (stats.unknown > stats.active) {
      console.log(`⚡ Priority: Validate more profiles to improve database quality`);
      console.log(`   Current active rate: ${activeRate}% of validated profiles`);
    }

    console.log();
    console.log('🎉 Database cleanup and validation in progress!');
    console.log('   Your creator database quality is improving with each validation run.');

  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

// Run the report
if (require.main === module) {
  showDatabaseQuality()
    .then(() => {
      console.log('\n✅ Report generated successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Report generation failed:', error);
      process.exit(1);
    });
}

module.exports = { showDatabaseQuality };