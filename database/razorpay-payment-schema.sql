-- Razorpay Payment Integration Database Schema
-- Run this in Supabase SQL Editor

-- Update campaign_payments table to support Razorpay
ALTER TABLE campaign_payments
ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT, -- card, netbanking, upi, wallet, etc.
ADD COLUMN IF NOT EXISTS payment_details JSONB, -- email, contact, bank, wallet, vpa details
ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS refund_id TEXT,
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS refund_reason TEXT,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_campaign_payments_razorpay_order ON campaign_payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_campaign_payments_razorpay_payment ON campaign_payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_campaign_payments_status ON campaign_payments(payment_status);

-- Add payment_status to campaigns table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campaigns' 
        AND column_name = 'payment_status'
    ) THEN
        ALTER TABLE campaigns 
        ADD COLUMN payment_status TEXT DEFAULT 'pending' 
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partial'));
    END IF;
END $$;

-- Update existing payment records
UPDATE campaign_payments
SET payment_status = 'pending'
WHERE payment_status IS NULL OR payment_status = '';

-- Add comments for documentation
COMMENT ON COLUMN campaign_payments.razorpay_order_id IS 'Razorpay order ID (order_xxx format)';
COMMENT ON COLUMN campaign_payments.razorpay_payment_id IS 'Razorpay payment ID (pay_xxx format)';
COMMENT ON COLUMN campaign_payments.payment_method IS 'Payment method used: card, netbanking, upi, wallet, emi';
COMMENT ON COLUMN campaign_payments.payment_details IS 'JSON object with payment details like email, contact, bank, wallet info';
COMMENT ON COLUMN campaign_payments.refund_id IS 'Razorpay refund ID if refund was processed';

-- Create a view for payment summary
CREATE OR REPLACE VIEW payment_summary AS
SELECT 
    cp.campaign_id,
    c.campaign_name,
    c.budget,
    COUNT(cp.id) as total_transactions,
    SUM(CASE WHEN cp.payment_status = 'completed' THEN cp.amount ELSE 0 END) as total_paid,
    SUM(CASE WHEN cp.payment_status = 'refunded' THEN cp.refund_amount ELSE 0 END) as total_refunded,
    SUM(CASE WHEN cp.payment_status = 'failed' THEN cp.amount ELSE 0 END) as failed_amount,
    MAX(cp.payment_completed_at) as last_payment_date,
    c.payment_status as campaign_payment_status
FROM campaign_payments cp
JOIN campaigns c ON cp.campaign_id = c.id
GROUP BY cp.campaign_id, c.campaign_name, c.budget, c.payment_status;

-- Grant permissions
GRANT SELECT ON payment_summary TO anon, authenticated;

SELECT '✅ Razorpay payment schema updated successfully!' as status;
