 # 🎮 Sandbox Demo Environment Guide

## Overview

This guide will help you set up a **complete demo/test environment** with **sandbox payment mode** enabled. No real transactions will be processed - everything is simulated for testing purposes.

---

## ✨ What's Included

### 🏢 Demo Brand
- **TechStyle Fashion Demo** - A fictional fashion brand for testing

### 📋 4 Complete Campaign Scenarios

1. **🌟 Summer Collection Launch** (Creator Selection Phase)
   - Status: Active, awaiting creator approval
   - Budget: ₹75,000
   - 8 micro-influencers recommended
   - **Action**: Approve creators and move to payment

2. **🎉 Festive Season Campaign** (Payment Pending Phase) ⚡
   - Status: Ready for payment
   - Budget: ₹120,000
   - 8 macro-influencers approved
   - **Action**: ⭐ **TEST SANDBOX PAYMENT HERE**

3. **🚀 Smart Accessories Launch** (Content Approval Phase)
   - Status: Payment completed (sandbox), content under review
   - Budget: ₹200,000
   - 6 mega-influencers contracted
   - 6 content pieces submitted (mix of approved/pending/revision)
   - **Action**: Review and approve/reject content

4. **✨ Winter Collection 2024** (Completed Campaign)
   - Status: Fully completed
   - Budget: ₹90,000
   - 5 creators, all deliverables completed
   - Full performance analytics available
   - **Action**: View final results and analytics

### 👥 Demo Creators
- **24 curated creators** across three tiers:
  - 8 Micro (5K-15K followers)
  - 8 Macro (25K-75K followers)
  - 8 Mega (100K-2M followers)
- Real engagement rates and profiles
- Diverse categories: Fashion, Tech, Lifestyle, Fitness

### 💳 Sandbox Payment System
- ✅ **No real transactions**
- Auto-approval enabled
- Test payment methods available
- Full payment flow simulation

---

## 🚀 Setup Instructions

### Step 1: Ensure Demo User Exists

First, create the demo user in Supabase Auth:

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add User** (manual creation)
3. Enter:
   - Email: `demo@campayn.com`
   - Password: Choose a secure password (you'll use this to login)
   - Auto Confirm User: ✅ Enable
4. Click **Create User**

### Step 2: Run the Setup Script

Open **Supabase SQL Editor** and run:

```sql
-- Copy the entire contents of demo-sandbox-setup.sql
-- Paste into SQL Editor
-- Click "Run"
```

**File location**: `backend/database/demo-sandbox-setup.sql`

### Step 3: Verify Setup

You should see output like:

```
╔══════════════════════════════════════════════════════════╗
║   ✨ DEMO SANDBOX ENVIRONMENT - SETUP COMPLETE ✨        ║
╚══════════════════════════════════════════════════════════╝

📧 Demo Account: demo@campayn.com
🏢 Brands Created: 1
📋 Campaigns Created: 4
👥 Demo Creators: 24
📄 Content Items: 11
💳 Sandbox Payments: 2

💳 SANDBOX PAYMENT MODE: ✅ ENABLED
```

---

## 🎯 Testing the Sandbox Payment Flow

### Campaign 2: Festive Season Campaign (READY FOR TESTING)

This campaign is specifically set up to test the **complete payment workflow**:

#### Step-by-Step Testing:

1. **Login to Dashboard**
   ```
   Email: demo@campayn.com
   Password: [your password]
   ```

2. **Navigate to Campaigns**
   - Go to your dashboard
   - Find "🎉 Festive Season Campaign"
   - Status should show: "Payment Pending"

3. **Initiate Payment**
   - Click on the campaign
   - Look for "Proceed to Payment" or "Pay Now" button
   - Click to start payment flow

4. **Sandbox Payment Screen**
   - You'll see payment amount: ₹120,000
   - Available test payment methods:
     - ✅ Test UPI
     - ✅ Test Card
     - ✅ Test Net Banking
     - ✅ Test Wallet

5. **Complete Test Payment**
   - Select any test payment method
   - Enter any test credentials (they won't be validated)
   - Click "Complete Payment"

6. **Auto-Approval**
   - Payment will auto-complete (2 second simulation)
   - Success message will appear
   - Campaign status updates to "Payment Completed"
   - Campaign moves to next phase

7. **Verify Payment**
   - Check payment history
   - Payment status should be "Paid"
   - Payment method shows: `test_upi` or `test_card`
   - Metadata contains: `"sandbox_mode": true`

---

## 🎨 What You Can Test

### 1. Creator Selection (Campaign 1)
- ✅ View recommended creators
- ✅ Approve/reject individual creators
- ✅ Request more information
- ✅ Move to payment phase

### 2. Payment Flow (Campaign 2) ⚡ PRIMARY TEST
- ✅ View payment summary
- ✅ Select payment method
- ✅ Complete sandbox payment
- ✅ Verify payment success
- ✅ Campaign phase transition
- ✅ Payment notifications
- ✅ Payment history

### 3. Content Review (Campaign 3)
- ✅ View submitted content (6 pieces)
- ✅ Approve content (3 pre-approved)
- ✅ Request revisions (1 needs revision)
- ✅ Add feedback comments
- ✅ Schedule content publishing
- ✅ View content previews

### 4. Analytics & Reports (Campaign 4)
- ✅ View campaign performance
- ✅ Reach and impressions data
- ✅ Engagement metrics
- ✅ Individual creator performance
- ✅ ROI calculations
- ✅ Export reports

---

## 💳 Sandbox Payment Details

### Configuration

The sandbox is configured with these settings:

```json
{
  "enabled": true,
  "auto_approve_payments": true,
  "simulate_delay_seconds": 2
}
```

### Test Payment Methods

All these payment methods are **simulated** and safe to use:

| Method | Identifier | Description |
|--------|-----------|-------------|
| Test UPI | `test_upi` | Simulated UPI payment |
| Test Card | `test_card` | Simulated card payment |
| Test Net Banking | `test_netbanking` | Simulated banking |
| Test Wallet | `test_wallet` | Simulated wallet payment |

### Payment Metadata

All sandbox payments include metadata:

```json
{
  "sandbox_mode": true,
  "auto_approved": true,
  "test_payment": true,
  "note": "This is a simulated payment for demo purposes"
}
```

---

## 🔍 Verifying Sandbox Mode

### SQL Check

```sql
-- Verify sandbox mode is enabled
SELECT * FROM payment_config 
WHERE config_key = 'sandbox_mode';

-- Should return:
-- enabled: true
-- auto_approve_payments: true
```

### Application Check

In your payment UI, you should see:
- 🧪 "SANDBOX MODE" badge or indicator
- ⚡ "Test Payment" labels
- 🔒 "No real charges" disclaimer

---

## 📊 Campaign Status Flow

```
┌──────────────────┐
│ Creator Selection │ → Approve creators
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Payment Pending   │ → [SANDBOX PAYMENT] ⚡
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Content Approval  │ → Review & approve content
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Campaign Active   │ → Content is being published
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Campaign Complete │ → View analytics
└──────────────────┘
```

---

## 🛠️ Troubleshooting

### Issue: Demo user not found
**Solution**: Create the user in Supabase Auth first (Step 1)

### Issue: Payment button not showing
**Solution**: 
- Ensure creators are approved (Campaign 1)
- Verify campaign is in "Payment Pending" phase (Campaign 2)

### Issue: Sandbox mode not detected
**Solution**: 
- Check `payment_config` table exists
- Verify `sandbox_mode` config is set to `true`

### Issue: No campaigns showing
**Solution**: 
- Re-run the setup script
- Check that demo user ID matches in brands table

---

## 🔄 Resetting the Demo

To start fresh, simply re-run the setup script. It will:
1. ✅ Clean all existing demo data
2. ✅ Reset campaigns to initial states
3. ✅ Re-create all demo content
4. ✅ Keep sandbox mode enabled

```sql
-- Re-run in Supabase SQL Editor
\i backend/database/demo-sandbox-setup.sql
```

---

## 📝 Important Notes

### ⚠️ Sandbox Only
- This environment is for **TESTING ONLY**
- No real payments will be processed
- No real money will be charged
- All transactions are simulated

### 🔒 Data Isolation
- Demo data is isolated by user email (`demo@campayn.com`)
- Won't interfere with production data
- Safe to reset anytime

### 🎯 Production vs Sandbox
| Feature | Sandbox | Production |
|---------|---------|------------|
| Real Payments | ❌ No | ✅ Yes |
| Razorpay Integration | ❌ Simulated | ✅ Live |
| Auto-approval | ✅ Yes | ❌ No |
| Test Methods | ✅ Available | ❌ Unavailable |

---

## 🎉 You're All Set!

Your sandbox demo environment is ready for comprehensive end-to-end testing. 

**Primary Focus**: Test the payment flow with Campaign 2 (Festive Season Campaign)

**Login**: `demo@campayn.com`

**Start Testing**: Navigate to your campaigns dashboard and explore all phases!

---

## 📞 Support

If you encounter any issues:
1. Check this guide's troubleshooting section
2. Verify all setup steps were completed
3. Re-run the setup script to reset
4. Check Supabase logs for any errors

Happy Testing! 🚀
