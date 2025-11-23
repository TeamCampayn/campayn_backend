const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Delete obviously invalid profiles based on patterns
async function deleteObviouslyInvalid() {
  console.log('🗑️  DELETING OBVIOUSLY INVALID PROFILES');
  console.log('=====================================\n');

  let totalDeleted = 0;

  try {
    // 1. Delete profiles with suspicious handle patterns
    console.log('1️⃣  Deleting profiles with suspicious handle patterns...');
    
    const suspiciousPatterns = [
      '%test%', '%fake%', '%demo%', '%123%', '%000%', 
      '%1234%', '%0001%', '%temp%', '%sample%',
      '%example%', '%null%', '%undefined%'
    ];

    for (const pattern of suspiciousPatterns) {
      const { data: suspicious, error: fetchError } = await supabase
        .from('creators')
        .select('id, name, ig_handle')
        .ilike('ig_handle', pattern)
        .limit(50);

      if (fetchError) throw fetchError;

      if (suspicious && suspicious.length > 0) {
        console.log(`   Found ${suspicious.length} profiles matching "${pattern}":`);
        
        for (const creator of suspicious) {
          console.log(`   - Deleting: ${creator.name} (@${creator.ig_handle})`);
        }

        const { error: deleteError } = await supabase
          .from('creators')
          .delete()
          .ilike('ig_handle', pattern);

        if (deleteError) throw deleteError;
        
        totalDeleted += suspicious.length;
        console.log(`   ✅ Deleted ${suspicious.length} profiles\n`);
      }
    }

    // 2. Delete profiles with invalid handle formats
    console.log('2️⃣  Deleting profiles with invalid handle formats...');
    
    const { data: invalidFormats, error: formatError } = await supabase
      .from('creators')
      .select('id, name, ig_handle')
      .or('ig_handle.is.null,ig_handle.eq.,ig_handle.eq.@')
      .limit(100);

    if (formatError) throw formatError;

    if (invalidFormats && invalidFormats.length > 0) {
      console.log(`   Found ${invalidFormats.length} profiles with invalid formats`);
      
      const { error: deleteFormatError } = await supabase
        .from('creators')
        .delete()
        .or('ig_handle.is.null,ig_handle.eq.,ig_handle.eq.@');

      if (deleteFormatError) throw deleteFormatError;
      
      totalDeleted += invalidFormats.length;
      console.log(`   ✅ Deleted ${invalidFormats.length} profiles with invalid formats\n`);
    }

    // 3. Delete profiles already marked as not_found
    console.log('3️⃣  Deleting profiles already marked as not_found...');
    
    const { data: notFound, error: notFoundError } = await supabase
      .from('creators')
      .select('id, name, ig_handle')
      .eq('account_status', 'not_found')
      .limit(200);

    if (notFoundError) throw notFoundError;

    if (notFound && notFound.length > 0) {
      console.log(`   Found ${notFound.length} profiles marked as not_found`);
      
      const { error: deleteNotFoundError } = await supabase
        .from('creators')
        .delete()
        .eq('account_status', 'not_found');

      if (deleteNotFoundError) throw deleteNotFoundError;
      
      totalDeleted += notFound.length;
      console.log(`   ✅ Deleted ${notFound.length} not_found profiles\n`);
    }

    // 4. Show final statistics
    console.log('=' .repeat(50));
    console.log('🎉 CLEANUP SUMMARY');
    console.log('=' .repeat(50));
    console.log(`🗑️  Total profiles deleted: ${totalDeleted}`);
    
    // Get updated database stats
    const { data: remainingStats, error: statsError } = await supabase
      .from('creators')
      .select('account_status')
      .not('ig_handle', 'is', null);

    if (!statsError && remainingStats) {
      const statusCounts = remainingStats.reduce((acc, creator) => {
        const status = creator.account_status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      console.log(`\n📊 Updated Database Stats:`);
      console.log(`Total remaining creators: ${remainingStats.length}`);
      Object.entries(statusCounts).forEach(([status, count]) => {
        const percentage = ((count / remainingStats.length) * 100).toFixed(1);
        console.log(`${status}: ${count} (${percentage}%)`);
      });
    }

    if (totalDeleted > 0) {
      console.log(`\n💾 Database space freed up by removing ${totalDeleted} invalid profiles!`);
      console.log(`💡 Your database quality has been significantly improved.`);
    } else {
      console.log(`\n✨ No obviously invalid profiles found - your database is already clean!`);
    }

  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }

  return totalDeleted;
}

// Run the cleanup
if (require.main === module) {
  deleteObviouslyInvalid()
    .then(deleted => {
      console.log(`\n✅ Cleanup completed successfully. Deleted ${deleted} profiles.`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { deleteObviouslyInvalid };