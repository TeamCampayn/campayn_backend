const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Lazy initialize Razorpay to surface configuration errors gracefully
let razorpay = null;
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

// Create Razorpay Order
router.post('/api/campaigns/:campaignId/create-payment-order', async (req, res) => {
  try {
    const { campaignId } = req.params;
    let { amount, currency = 'INR', receipt } = req.body;

    // Validate config early
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'Payment gateway not configured',
        error_type: 'config_error',
        missing: {
          RAZORPAY_KEY_ID: !process.env.RAZORPAY_KEY_ID,
          RAZORPAY_KEY_SECRET: !process.env.RAZORPAY_KEY_SECRET
        }
      });
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, campaign_name, budget, brand_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Validate / fallback amount
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      amount = Number(campaign.budget) || 0;
    } else {
      amount = numericAmount;
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount for order',
        error_type: 'validation_error'
      });
    }

    const rp = getRazorpay();
    if (!rp) {
      return res.status(500).json({ success: false, error: 'Failed to initialize payment gateway', error_type: 'init_error' });
    }

    // Build a compact receipt <= 40 chars (Razorpay limit)
    const shortCampaign = String(campaignId).replace(/-/g, '').slice(0, 12); // 12 chars of UUID
    const timeFrag = Date.now().toString().slice(-6); // last 6 digits of timestamp
    const rawReceipt = receipt || `cmp_${shortCampaign}_${timeFrag}`; // length ~ 4+12+1+6 = 23
    const safeReceipt = rawReceipt.slice(0, 40); // enforce max length safety

    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: safeReceipt,
      notes: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        brand_id: campaign.brand_id
      }
    };

    let order;
    try {
      order = await rp.orders.create(options);
    } catch (gatewayErr) {
      console.error('Razorpay order creation error:', gatewayErr);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment order',
        error_type: 'gateway_error',
        gateway_details: gatewayErr?.error || { message: gatewayErr.message }
      });
    }

    // Store order in database
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('payments')
      .insert([{
        campaign_id: campaignId,
        razorpay_order_id: order.id,
        amount: amount,
        currency: currency,
        status: 'created',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (paymentError) {
      console.error('Error storing payment record:', paymentError);
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },
      payment_record_id: paymentRecord?.id
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment order',
      details: error.message
    });
  }
});

// Verify Razorpay Payment
router.post('/api/campaigns/:campaignId/verify-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Fetch payment details from Razorpay
    const rp = getRazorpay();
    if (!rp) {
      return res.status(500).json({ success: false, error: 'Payment gateway not configured' });
    }
    const payment = await rp.payments.fetch(razorpay_payment_id);

    // Update payment record in database
    const { data: updatedPayment, error: updateError } = await supabase
      .from('payments')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        razorpay_signature: razorpay_signature,
        status: payment.status === 'captured' ? 'paid' : payment.status,
        payment_method: payment.method,
        payment_verified_at: new Date().toISOString(),
        payment_details: payment
      })
      .eq('campaign_id', campaignId)
      .eq('razorpay_order_id', razorpay_order_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating payment record:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update payment record'
      });
    }

    // Update campaign phase to content_approval if payment is successful
    if (payment.status === 'captured') {
      const { error: campaignUpdateError } = await supabase
        .from('campaigns')
        .update({
          phase: 'content_approval',
          payment_completed_at: new Date().toISOString()
        })
        .eq('id', campaignId);

      if (campaignUpdateError) {
        console.error('Error updating campaign phase:', campaignUpdateError);
      }

      // Log activity
      await supabase
        .from('campaign_activities')
        .insert([{
          campaign_id: campaignId,
          user_id: payment.notes?.brand_id || 'system',
          user_type: 'brand',
          activity_type: 'payment_completed',
          description: `Payment of ₹${payment.amount / 100} completed successfully`,
          metadata: {
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            amount: payment.amount / 100,
            method: payment.method
          }
        }]);
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: {
        id: razorpay_payment_id,
        order_id: razorpay_order_id,
        status: payment.status,
        amount: payment.amount / 100,
        method: payment.method
      }
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
      details: error.message
    });
  }
});

// Get Payment Status
router.get('/api/campaigns/:campaignId/payment-status', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching payment:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payment status'
      });
    }

    if (!payment) {
      return res.json({
        success: true,
        payment: null,
        message: 'No payment found for this campaign'
      });
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        order_id: payment.razorpay_order_id,
        payment_id: payment.razorpay_payment_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        payment_method: payment.payment_method,
        created_at: payment.created_at,
        verified_at: payment.payment_verified_at
      }
    });

  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment status',
      details: error.message
    });
  }
});

// Razorpay Webhook Handler
router.post('/api/webhooks/razorpay', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const generated_signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (generated_signature !== signature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    console.log('Razorpay webhook received:', event);

    // Handle different events
    switch (event) {
      case 'payment.captured':
        // Update payment status
        await supabase
          .from('payments')
          .update({
            status: 'paid',
            razorpay_payment_id: payload.id,
            payment_verified_at: new Date().toISOString(),
            payment_details: payload
          })
          .eq('razorpay_order_id', payload.order_id);

        // Update campaign phase
        const campaignId = payload.notes?.campaign_id;
        if (campaignId) {
          await supabase
            .from('campaigns')
            .update({
              phase: 'content_approval',
              payment_completed_at: new Date().toISOString()
            })
            .eq('id', campaignId);
        }
        break;

      case 'payment.failed':
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            payment_details: payload
          })
          .eq('razorpay_order_id', payload.order_id);
        break;

      case 'refund.created':
        await supabase
          .from('payments')
          .update({
            status: 'refunded',
            refund_details: payload
          })
          .eq('razorpay_payment_id', payload.payment_id);
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      details: error.message
    });
  }
});

// Refund Payment (Admin only)
router.post('/api/campaigns/:campaignId/refund-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { payment_id, amount, reason } = req.body;

    // Fetch payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('razorpay_payment_id', payment_id)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Create refund
    const refundOptions = {
      payment_id: payment_id,
      amount: amount ? amount * 100 : undefined, // Partial or full refund
      notes: {
        reason: reason || 'Refund requested',
        campaign_id: campaignId
      }
    };

    const rp = getRazorpay();
    if (!rp) {
      return res.status(500).json({ success: false, error: 'Payment gateway not configured' });
    }
    const refund = await rp.payments.refund(payment_id, refundOptions);

    // Update payment record
    await supabase
      .from('payments')
      .update({
        status: 'refunded',
        refund_details: refund,
        refunded_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    // Log activity
    await supabase
      .from('campaign_activities')
      .insert([{
        campaign_id: campaignId,
        user_id: 'admin',
        user_type: 'admin',
        activity_type: 'payment_refunded',
        description: `Refund of ₹${refund.amount / 100} initiated`,
        metadata: {
          refund_id: refund.id,
          payment_id: payment_id,
          amount: refund.amount / 100,
          reason: reason
        }
      }]);

    res.json({
      success: true,
      message: 'Refund initiated successfully',
      refund: {
        id: refund.id,
        payment_id: payment_id,
        amount: refund.amount / 100,
        status: refund.status
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
      details: error.message
    });
  }
});

module.exports = router;
