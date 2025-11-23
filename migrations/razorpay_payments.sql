-- Create razorpay_payments table to track payment link submissions and verifications
CREATE TABLE IF NOT EXISTS razorpay_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  razorpay_payment_id TEXT NOT NULL,
  payment_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'verified', 'rejected')),
  
  -- Submission details
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES profiles(id),
  
  -- Verification details
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),
  
  -- Rejection details
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_campaign_payment UNIQUE (campaign_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_campaign ON razorpay_payments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_status ON razorpay_payments(status);
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_submitted_at ON razorpay_payments(submitted_at);

-- Add payment_status column to campaigns table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'campaigns' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'submitted', 'completed', 'rejected'));
  END IF;
END $$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_razorpay_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS razorpay_payments_updated_at ON razorpay_payments;
CREATE TRIGGER razorpay_payments_updated_at
  BEFORE UPDATE ON razorpay_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_razorpay_payments_updated_at();

-- Enable RLS
ALTER TABLE razorpay_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for razorpay_payments

-- Brands can view their own campaign payments
CREATE POLICY "Brands can view own campaign payments"
  ON razorpay_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = razorpay_payments.campaign_id
      AND campaigns.brand_id = auth.uid()
    )
  );

-- Brands can insert/update their own campaign payments (only when status is pending or rejected)
CREATE POLICY "Brands can submit payments for own campaigns"
  ON razorpay_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = razorpay_payments.campaign_id
      AND campaigns.brand_id = auth.uid()
    )
  );

CREATE POLICY "Brands can update own pending/rejected payments"
  ON razorpay_payments
  FOR UPDATE
  USING (
    status IN ('pending', 'rejected')
    AND EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = razorpay_payments.campaign_id
      AND campaigns.brand_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('pending', 'submitted')
    AND EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = razorpay_payments.campaign_id
      AND campaigns.brand_id = auth.uid()
    )
  );

-- Admins have full access
CREATE POLICY "Admins have full access to razorpay_payments"
  ON razorpay_payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

-- Comments for documentation
COMMENT ON TABLE razorpay_payments IS 'Tracks Razorpay payment link submissions and manual verifications';
COMMENT ON COLUMN razorpay_payments.razorpay_payment_id IS 'Payment ID provided by brand after paying through razorpay.me/@campaynprivatelimited';
COMMENT ON COLUMN razorpay_payments.status IS 'Payment verification status: pending (not submitted), submitted (awaiting admin), verified (approved), rejected (invalid)';
COMMENT ON COLUMN razorpay_payments.rejection_reason IS 'Admin explanation for why payment was rejected';
