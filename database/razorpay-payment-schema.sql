-- Razorpay Payment Integration Schema
-- Run this in Supabase SQL Editor

-- Create payments table if it doesn't exist
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Razorpay Order Details
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  
  -- Payment Amount
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  
  -- Payment Status
  status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed', 'refunded', 'processing')),
  payment_method TEXT, -- card, netbanking, upi, wallet, etc.
  
  -- Payment Details
  payment_details JSONB, -- Full payment object from Razorpay
  refund_details JSONB, -- Refund information if applicable
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payment_verified_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  
  -- Indexes for faster queries
  CONSTRAINT unique_campaign_payment UNIQUE (campaign_id, razorpay_order_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payments_campaign_id ON payments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Add payment-related columns to campaigns table if they don't exist
DO $$ 
BEGIN
    -- Add payment_completed_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='campaigns' AND column_name='payment_completed_at') THEN
        ALTER TABLE campaigns ADD COLUMN payment_completed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add payment_status if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='campaigns' AND column_name='payment_status') THEN
        ALTER TABLE campaigns ADD COLUMN payment_status TEXT DEFAULT 'pending' 
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partial'));
    END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role (backend) can do everything
CREATE POLICY "Service role can manage payments"
  ON payments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policy: Brands can view their own campaign payments
CREATE POLICY "Brands can view their campaign payments"
  ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = payments.campaign_id
      AND campaigns.brand_id = auth.uid()
    )
  );

-- RLS Policy: Admins can view all payments
CREATE POLICY "Admins can view all payments"
  ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'is_admin')::boolean = true
    )
  );

-- Create a view for payment summaries
CREATE OR REPLACE VIEW payment_summaries AS
SELECT 
  p.id,
  p.campaign_id,
  c.campaign_name,
  b.brand_name,
  p.razorpay_order_id,
  p.razorpay_payment_id,
  p.amount,
  p.currency,
  p.status,
  p.payment_method,
  p.created_at,
  p.payment_verified_at,
  p.refunded_at,
  CASE 
    WHEN p.status = 'paid' THEN 'Successful'
    WHEN p.status = 'failed' THEN 'Failed'
    WHEN p.status = 'refunded' THEN 'Refunded'
    WHEN p.status = 'pending' THEN 'Pending'
    WHEN p.status = 'created' THEN 'Created'
    ELSE 'Unknown'
  END as status_display
FROM payments p
JOIN campaigns c ON c.id = p.campaign_id
JOIN brands b ON b.id = c.brand_id;

-- Grant access to the view
GRANT SELECT ON payment_summaries TO authenticated;
GRANT SELECT ON payment_summaries TO service_role;

-- Create function to get campaign payment info
CREATE OR REPLACE FUNCTION get_campaign_payment_info(campaign_uuid UUID)
RETURNS TABLE (
  campaign_id UUID,
  campaign_name TEXT,
  budget DECIMAL,
  payment_status TEXT,
  payment_amount DECIMAL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  payment_verified_at TIMESTAMP WITH TIME ZONE,
  payment_method TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.campaign_name,
    c.budget,
    COALESCE(p.status, 'pending') as payment_status,
    p.amount as payment_amount,
    p.razorpay_order_id,
    p.razorpay_payment_id,
    p.payment_verified_at,
    p.payment_method
  FROM campaigns c
  LEFT JOIN payments p ON p.campaign_id = c.id
  WHERE c.id = campaign_uuid
  ORDER BY p.created_at DESC
  LIMIT 1;
END;
$$;

-- Comment on tables
COMMENT ON TABLE payments IS 'Razorpay payment records for campaigns';
COMMENT ON COLUMN payments.razorpay_order_id IS 'Razorpay order ID (order_xxx)';
COMMENT ON COLUMN payments.razorpay_payment_id IS 'Razorpay payment ID (pay_xxx)';
COMMENT ON COLUMN payments.razorpay_signature IS 'HMAC signature for payment verification';
COMMENT ON COLUMN payments.payment_details IS 'Full payment object from Razorpay API';

-- Success message
SELECT 'Razorpay payment schema created successfully! ✅' as status;
