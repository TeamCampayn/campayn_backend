const { createClient } = require('@supabase/supabase-js');

// Frontend client (with anon key - this is what the React app uses)
const supabaseFrontend = createClient(
  'https://rxsgvhstplsjahhvlhsspfvjycjh.supabase.co',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c2d2aHN0cGxzamFoaHZsaHNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkyNjYxMjEsImV4cCI6MjA0NDg0MjEyMX0.SoI30qUK3PUM_2xx4g1suLV-GjhQ6_h5mRWHwRIlAhU'
);

async function testAuthAndCampaignCreation() {
  console.log('Testing authentication and campaign creation...');
  
  // Step 1: Sign in as admin
  console.log('\n1. Signing in as admin...');
  const { data: authData, error: authError } = await supabaseFrontend.auth.signInWithPassword({
    email: 'admin@example.com',
    password: 'adminpassword'
  });
  
  if (authError) {
    console.error('Auth error:', authError);
    return;
  }
  
  console.log('✓ Successfully signed in');
  console.log('User ID:', authData.user.id);
  
  // Step 2: Get the user's brand
  console.log('\n2. Getting user brand...');
  const { data: brands, error: brandError } = await supabaseFrontend
    .from('brands')
    .select('*')
    .eq('user_id', authData.user.id);
  
  if (brandError) {
    console.error('Brand fetch error:', brandError);
    return;
  }
  
  if (!brands || brands.length === 0) {
    console.error('No brands found for this user');
    return;
  }
  
  console.log('✓ Found brand:', brands[0].name);
  const brandId = brands[0].id;
  
  // Step 3: Try to create a campaign
  console.log('\n3. Creating a test campaign...');
  const testCampaign = {
    brand_id: brandId,
    campaign_name: 'Test Campaign - ' + new Date().toISOString(),
    campaign_description: 'This is a test campaign to debug RLS',
    budget: 5000,
    status: 'creator_selection',
    target_creators_count: 3
  };
  
  const { data: campaign, error: campaignError } = await supabaseFrontend
    .from('campaigns')
    .insert(testCampaign)
    .select();
  
  if (campaignError) {
    console.error('❌ Campaign creation error:', campaignError);
    console.error('Error details:', JSON.stringify(campaignError, null, 2));
  } else {
    console.log('✓ Campaign created successfully:', campaign[0]);
  }
  
  // Step 4: Check current session
  console.log('\n4. Current session info:');
  const { data: session } = await supabaseFrontend.auth.getSession();
  console.log('Session exists:', !!session.session);
  if (session.session) {
    console.log('User role:', session.session.user.role);
    console.log('User ID:', session.session.user.id);
  }
}

testAuthAndCampaignCreation().catch(console.error);