const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rxsgvhstplsjahhvlhss.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c2d2aHN0cGxzamFoaHZsaHNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODY1NDQsImV4cCI6MjA3NDc2MjU0NH0.3aN3Cxvmgp28lwMgLsNJ_kWvWbnEoxYdyXa7bBIEF1A';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuthAfterReset() {
  console.log('=== Testing authentication after password reset ===');
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'dhairyaraniwal914@gmail.com',
    password: 'Gaussian@123'
  });

  if (error) {
    console.log('❌ Login still failed:', error.message);
    console.log('Error details:', error);
    return;
  }

  console.log('✅ Login successful!');
  console.log('User ID:', data.user?.id);
  console.log('Session token exists:', !!data.session?.access_token);

  // Test brand access
  const { data: brands, error: brandError } = await supabase
    .from('brands')
    .select('*');
  
  if (brandError) {
    console.log('❌ Cannot fetch brands:', brandError.message);
    return;
  }

  console.log('✅ Found', brands.length, 'brands');

  if (brands.length > 0) {
    const brandId = brands[0].id;
    console.log('Using brand ID:', brandId);
    
    // Now test the exact campaign creation that the frontend does
    const testCampaign = {
      brand_id: brandId,
      campaign_name: 'Test Product Campaign',
      description: 'Content: Video, Creator: Micro-Influencer, Quality: Premium. Product: Test Product',
      budget: 5000,
      campaign_objectives: ['Brand Awareness', 'Product Marketing'],
      requirements: 'Content Type: Video, Creator Type: Micro-Influencer, Quality Level: Premium. Shipping required.',
      deliverables: {
        content_type: 'Video',
        creator_type: 'Micro-Influencer',
        quality_level: 'Premium',
        product_name: 'Test Product',
        shipping_required: true
      },
      phase: 'creator_selection',
      status: 'active',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    console.log('Attempting to create campaign...');

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .insert(testCampaign)
      .select()
      .single();

    if (campaignError) {
      console.log('❌ Campaign creation failed:', campaignError.message);
      console.log('Error code:', campaignError.code);
      console.log('Error hint:', campaignError.hint);
      console.log('Full error:', JSON.stringify(campaignError, null, 2));
    } else {
      console.log('✅ Campaign created successfully!');
      console.log('Campaign data:', {
        id: campaignData.id,
        campaign_name: campaignData.campaign_name,
        brand_id: campaignData.brand_id,
        phase: campaignData.phase,
        status: campaignData.status
      });
      
      // Clean up
      await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignData.id);
      console.log('🧹 Test campaign cleaned up');
    }
  }
}

testAuthAfterReset().catch(console.error);