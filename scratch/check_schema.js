const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkSchema() {
  const { data, error } = await supabase
    .from('creators')
    .select('campayn_score')
    .limit(1);

  if (error) {
    console.error('Error checking campayn_score:', error.message);
    if (error.message.includes('column "campayn_score" does not exist')) {
      console.log('MIGRATION_REQUIRED: Column campayn_score is missing.');
    }
  } else {
    console.log('SUCCESS: Column campayn_score exists.');
  }
}

checkSchema();
