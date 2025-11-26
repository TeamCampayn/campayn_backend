const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixFunction() {
  console.log('Testing recommend_creators function...');
  
  const { data, error } = await supabase
    .rpc('recommend_creators', {
      p_category: 'Entertainment',
      p_subcategory: 'Feel-Good News / Stories',
      p_creator_type: 'macro',
      p_limit: 10,
      p_min_engagement: 0.5
    });
  
  if (error) {
    console.log('❌ Error:', error.message);
    console.log('\nPlease run the SQL in Supabase SQL Editor:');
    console.log(fs.readFileSync('./database/fix-recommend-creators-function.sql', 'utf8'));
  } else {
    console.log('✅ Function works! Found', data?.length || 0, 'creators');
    if (data && data.length > 0) {
      console.log('\nSample creator:', JSON.stringify(data[0], null, 2));
    }
  }
}

fixFunction();
