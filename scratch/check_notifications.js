const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkNotificationsTable() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .limit(1);

  if (error) {
    console.log('TABLE_MISSING: notifications table does not exist or is inaccessible.');
    console.error(error.message);
  } else {
    console.log('SUCCESS: notifications table exists.');
  }
}

checkNotificationsTable();
