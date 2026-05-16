const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkCreatorHandle() {
  const handle = 'viveksharma91319165';
  const { data, error } = await supabase
    .from('creators')
    .select('ig_handle, name')
    .eq('ig_handle', handle)
    .maybeSingle();

  if (error) {
    console.error('Error:', error.message);
  } else if (!data) {
    console.log(`Creator with handle "${handle}" NOT FOUND in database.`);
    
    // Try searching for any handle
    const { data: all } = await supabase.from('creators').select('ig_handle').limit(5);
    console.log('Sample handles in DB:', all.map(a => a.ig_handle));
  } else {
    console.log('Creator FOUND:', data);
  }
}

checkCreatorHandle();
