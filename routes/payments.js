const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay Order
router.post('/api/payments/create-order', async (req, res) => {
  try {
    const { campaignId, amount, currency = 'INR' } = req.body;

    if (!campaignId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Campaign ID and amount are required'
      });
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, brands(brand_name, user_id)')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Convert to paise (smallest currency unit)
      currency: currency,
      receipt: `campaign_${campaignId}_${Date.now()}`,
      notes: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        brand_name: campaign.brands.brand_name,
        brand_user_id: campaign.brands.user_id,
      }
    };

    const order = await razorpay.orders.create(options);

    // Store payment record in database
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('campaign_payments')
      .insert({
        campaign_id: campaignId,
        razorpay_order_id: order.id,
        amount: amount,
        currency: currency,
        payment_status: 'pending',
        payment_type: 'campaign_fee',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Error storing payment record:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment record'
      });
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
      paymentRecordId: paymentRecord.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // Send to frontend for checkout
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment order'
    });
  }
});

// Verify Payment Signature
router.post('/api/payments/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentRecordId,
      campaignId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing payment verification parameters'
      });
    }

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    const isAuthentic = expectedSign === razorpay_signature;

    if (!isAuthentic) {
      // Update payment record as failed
      await supabase
        .from('campaign_payments')
        .update({
          payment_status: 'failed',
          failure_reason: 'Invalid signature',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentRecordId);

      return res.status(400).json({
        success: false,
        error: 'Payment verification failed'
      });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // Update payment record
    const { data: updatedPayment, error: updateError } = await supabase
      .from('campaign_payments')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        payment_status: 'completed',
        payment_method: payment.method,
        payment_completed_at: new Date().toISOString(),
        payment_details: {
          email: payment.email,
          contact: payment.contact,
          method: payment.method,
          bank: payment.bank,
          wallet: payment.wallet,
          vpa: payment.vpa,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentRecordId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating payment record:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update payment record'
      });
    }

    // Update campaign phase to content_approval (move from payment_pending)
    await supabase
      .from('campaigns')
      .update({
        phase: 'content_approval',
        payment_status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    // Log activity
    await supabase
      .from('campaign_activities')
      .insert({
        campaign_id: campaignId,
        activity_type: 'payment_completed',
        description: `Payment of ₹${updatedPayment.amount} completed successfully via ${payment.method}`,
        metadata: {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          amount: updatedPayment.amount,
          method: payment.method,
        },
        created_at: new Date().toISOString(),
      });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: updatedPayment,
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment verification failed'
    });
  }
});

// Handle Payment Failure
router.post('/api/payments/failed', async (req, res) => {
  try {
    const { paymentRecordId, campaignId, error } = req.body;

    // Update payment record
    await supabase
      .from('campaign_payments')
      .update({
        payment_status: 'failed',
        failure_reason: error?.description || 'Payment failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentRecordId);

    // Log activity
    await supabase
      .from('campaign_activities')
      .insert({
        campaign_id: campaignId,
        activity_type: 'payment_failed',
        description: `Payment failed: ${error?.description || 'Unknown error'}`,
        metadata: { error },
        created_at: new Date().toISOString(),
      });

    res.json({
      success: true,
      message: 'Payment failure recorded'
    });

  } catch (error) {
    console.error('Error recording payment failure:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Razorpay Webhook Handler
router.post('/api/payments/webhook', async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest('hex');

    const isAuthentic = expectedSignature === webhookSignature;

    if (!isAuthentic) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    const event = req.body.event;
    const payloadData = req.body.payload.payment.entity;

    console.log('Razorpay Webhook Event:', event);

    switch (event) {
      case 'payment.captured':
        // Payment was successful
        await supabase
          .from('campaign_payments')
          .update({
            payment_status: 'completed',
            razorpay_payment_id: payloadData.id,
            payment_completed_at: new Date(payloadData.created_at * 1000).toISOString(),
          })
          .eq('razorpay_order_id', payloadData.order_id);
        break;

      case 'payment.failed':
        // Payment failed
        await supabase
          .from('campaign_payments')
          .update({
            payment_status: 'failed',
            failure_reason: payloadData.error_description,
          })
          .eq('razorpay_order_id', payloadData.order_id);
        break;

      case 'order.paid':
        // Order completed
        console.log('Order paid:', payloadData.id);
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Payment Details
router.get('/api/payments/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const { data: payments, error } = await supabase
      .from('campaign_payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      payments: payments || []
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Refund Payment
router.post('/api/payments/refund', async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;

    // Get payment record
    const { data: payment, error: fetchError } = await supabase
      .from('campaign_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (!payment.razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        error: 'No Razorpay payment ID found'
      });
    }

    // Create refund
    const refundAmount = amount ? Math.round(amount * 100) : undefined;
    const refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: refundAmount,
      notes: {
        reason: reason || 'Campaign cancellation',
        payment_id: paymentId,
      }
    });

    // Update payment record
    await supabase
      .from('campaign_payments')
      .update({
        payment_status: 'refunded',
        refund_id: refund.id,
        refund_amount: refund.amount / 100,
        refund_reason: reason,
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    // Log activity
    await supabase
      .from('campaign_activities')
      .insert({
        campaign_id: payment.campaign_id,
        activity_type: 'payment_refunded',
        description: `Refund of ₹${refund.amount / 100} initiated`,
        metadata: {
          refund_id: refund.id,
          amount: refund.amount / 100,
          reason: reason,
        },
        created_at: new Date().toISOString(),
      });

    res.json({
      success: true,
      message: 'Refund initiated successfully',
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Refund failed'
    });
  }
});

module.exports = router;
