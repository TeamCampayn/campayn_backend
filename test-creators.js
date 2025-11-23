const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testCreatorsTable() {
  console.log('Testing Supabase connection...');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SERVICE_KEY exists:', !!process.env.SUPABASE_SERVICE_KEY);

  try {
    // Test if creators table exists and get count
    console.log('\n1. Testing creators table access...');
    const { data: countData, error: countError, count } = await supabase
      .from('creators')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error accessing creators table:', countError.message);
      console.log('   This might mean:');
      console.log('   - The creators table does not exist');
      console.log('   - RLS policies are blocking access');
      console.log('   - Service key permissions are insufficient');
      return;
    }

    console.log('✅ Creators table accessible');
    console.log(`   Total records: ${count}`);

    if (count === 0) {
      console.log('⚠️  Creators table is empty - no records found');
      return;
    }

    // Get sample records
    console.log('\n2. Fetching sample records...');
    const { data: sampleData, error: sampleError } = await supabase
      .from('creators')
      .select('*')
      .limit(3);

    if (sampleError) {
      console.error('❌ Error fetching sample data:', sampleError.message);
      return;
    }

    console.log('✅ Sample records:');
    sampleData.forEach((creator, index) => {
      console.log(`   ${index + 1}. ${creator.name} (@${creator.ig_handle}) - ${creator.subcategory}`);
    });

    // Test categories
    console.log('\n3. Testing categories...');
    const { data: categoryData, error: categoryError } = await supabase
      .from('creators')
      .select('subcategory')
      .not('subcategory', 'is', null)
      .limit(100);

    if (categoryError) {
      console.error('❌ Error fetching categories:', categoryError.message);
      return;
    }

    const uniqueCategories = [...new Set(categoryData.map(item => item.subcategory))].sort();
    console.log('✅ Available categories:', uniqueCategories.slice(0, 10));
    console.log(`   Total unique categories: ${uniqueCategories.length}`);

    console.log('\n🎉 All tests passed! The creators table is ready to use.');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the test
testCreatorsTable();