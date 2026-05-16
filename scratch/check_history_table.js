const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function listTables() {
  const { data, error } = await supabase
    .from('creators')
    .select('id')
    .limit(1);

  if (error) console.error(error);
  
  // Querying information_schema is restricted for non-superusers sometimes, 
  // but let's try a simple query to see if follower_history exists
  const { error: histError } = await supabase.from('follower_history').select('id').limit(1);
  if (histError) {
    console.log('follower_history table does NOT exist or is inaccessible.');
  } else {
    console.log('follower_history table EXISTS.');
  }
}

listTables();
