const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkFullCreatorData() {
  const handle = 'viveksharma91319165';
  const { data, error } = await supabase
    .from('creators')
    .select('*')
    .eq('ig_handle', handle)
    .maybeSingle();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Creator Data:', JSON.stringify(data, null, 2));
  }
}

checkFullCreatorData();
