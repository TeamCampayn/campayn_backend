const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get payment info for a campaign
router.get('/api/campaigns/:campaignId/payment-info', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, campaign_name, budget, payment_status')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Get razorpay payment details if exists
    const { data: paymentData, error: paymentError } = await supabase
      .from('razorpay_payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Combine data
    const payment = {
      campaign_id: campaign.id,
      campaign_name: campaign.campaign_name,
      budget: campaign.budget,
      payment_amount: campaign.budget,
      payment_status: campaign.payment_status || 'pending',
      razorpay_payment_id: paymentData?.razorpay_payment_id,
      payment_notes: paymentData?.payment_notes,
      payment_submitted_at: paymentData?.submitted_at,
      payment_verified_at: paymentData?.verified_at,
    };

    res.json({ success: true, payment });
  } catch (error) {
    console.error('Error fetching payment info:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payment info' });
  }
});

// Brand submits Razorpay payment details
router.post('/api/campaigns/:campaignId/submit-razorpay-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { razorpay_payment_id, payment_notes, brand_id } = req.body;

    if (!razorpay_payment_id) {
      return res.status(400).json({ error: 'Razorpay Payment ID is required' });
    }

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from('razorpay_payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (existingPayment && existingPayment.status === 'verified') {
      return res.status(400).json({ error: 'Payment already verified for this campaign' });
    }

    // Insert or update razorpay payment record
    const paymentData = {
      campaign_id: campaignId,
      razorpay_payment_id: razorpay_payment_id.trim(),
      payment_notes: payment_notes?.trim() || null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: brand_id,
    };

    if (existingPayment) {
      // Update existing
      const { error: updateError } = await supabase
        .from('razorpay_payments')
        .update(paymentData)
        .eq('id', existingPayment.id);

      if (updateError) throw updateError;
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('razorpay_payments')
        .insert([paymentData]);

      if (insertError) throw insertError;
    }

    // Update campaign payment status
    const { error: campaignError } = await supabase
      .from('campaigns')
      .update({ payment_status: 'submitted' })
      .eq('id', campaignId);

    if (campaignError) throw campaignError;

    // Log activity
    await supabase.from('campaign_activities').insert([{
      campaign_id: campaignId,
      user_id: brand_id,
      user_type: 'brand',
      activity_type: 'payment_submitted',
      description: `Payment submitted with ID: ${razorpay_payment_id}`,
      metadata: { razorpay_payment_id },
    }]);

    res.json({ 
      success: true, 
      message: 'Payment details submitted successfully. Awaiting admin verification.' 
    });
  } catch (error) {
    console.error('Error submitting payment:', error);
    res.status(500).json({ error: error.message || 'Failed to submit payment' });
  }
});

// Admin: Get pending Razorpay payments
router.get('/api/admin/razorpay-payments/pending', async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('razorpay_payments')
      .select(`
        *,
        campaigns (
          id,
          campaign_name,
          budget,
          brands (
            brand_name
          )
        )
      `)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });

    if (error) throw error;

    const formattedPayments = payments.map(payment => ({
      campaign_id: payment.campaign_id,
      campaign_name: payment.campaigns.campaign_name,
      brand_name: payment.campaigns.brands.brand_name,
      budget: payment.campaigns.budget,
      payment_amount: payment.campaigns.budget,
      razorpay_payment_id: payment.razorpay_payment_id,
      payment_notes: payment.payment_notes,
      payment_submitted_at: payment.submitted_at,
      payment_status: payment.status,
    }));

    res.json({ success: true, payments: formattedPayments });
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pending payments' });
  }
});

// Admin: Verify Razorpay payment
router.post('/api/admin/campaigns/:campaignId/verify-razorpay-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { admin_id } = req.body;

    // Update razorpay_payments table
    const { error: paymentError } = await supabase
      .from('razorpay_payments')
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: admin_id,
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'submitted');

    if (paymentError) throw paymentError;

    // Update campaign status to content_approval phase
    const { error: campaignError } = await supabase
      .from('campaigns')
      .update({
        payment_status: 'completed',
        phase: 'content_approval',
      })
      .eq('id', campaignId);

    if (campaignError) throw campaignError;

    // Log activity
    await supabase.from('campaign_activities').insert([{
      campaign_id: campaignId,
      user_id: admin_id,
      user_type: 'admin',
      activity_type: 'payment_verified',
      description: 'Admin verified Razorpay payment',
    }]);

    res.json({ 
      success: true, 
      message: 'Payment verified successfully. Campaign moved to content approval phase.' 
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message || 'Failed to verify payment' });
  }
});

// Admin: Reject Razorpay payment
router.post('/api/admin/campaigns/:campaignId/reject-razorpay-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { admin_id, rejection_reason } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Update razorpay_payments table
    const { error: paymentError } = await supabase
      .from('razorpay_payments')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: admin_id,
        rejection_reason,
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'submitted');

    if (paymentError) throw paymentError;

    // Update campaign status back to pending
    const { error: campaignError } = await supabase
      .from('campaigns')
      .update({ payment_status: 'pending' })
      .eq('id', campaignId);

    if (campaignError) throw campaignError;

    // Log activity
    await supabase.from('campaign_activities').insert([{
      campaign_id: campaignId,
      user_id: admin_id,
      user_type: 'admin',
      activity_type: 'payment_rejected',
      description: `Admin rejected payment: ${rejection_reason}`,
      metadata: { rejection_reason },
    }]);

    res.json({ 
      success: true, 
      message: 'Payment rejected. Brand has been notified.' 
    });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ error: error.message || 'Failed to reject payment' });
  }
});

module.exports = router;
