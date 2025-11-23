-- Add admin_reply and brand_reply fields to campaign_creators table
-- This allows two-way communication between admins and brands about specific creators

ALTER TABLE campaign_creators 
ADD COLUMN IF NOT EXISTS admin_reply TEXT,
ADD COLUMN IF NOT EXISTS admin_reply_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS brand_reply TEXT,
ADD COLUMN IF NOT EXISTS brand_reply_at TIMESTAMP WITH TIME ZONE;

-- Create conversation_messages table for detailed conversation history
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  creator_id BIGINT REFERENCES creators(id) ON DELETE CASCADE NOT NULL,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('brand', 'admin')),
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('message', 'decision')) DEFAULT 'message',
  decision_type VARCHAR(20) CHECK (decision_type IN ('approved', 'rejected', 'requested_more')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, creator_id, sender_type, created_at)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_campaign_creators_admin_reply ON campaign_creators(admin_reply_at);
CREATE INDEX IF NOT EXISTS idx_campaign_creators_brand_reply ON campaign_creators(brand_reply_at);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_campaign_creator ON conversation_messages(campaign_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at);

-- Update any existing comments
COMMENT ON COLUMN campaign_creators.admin_reply IS 'Latest admin response to brand messages about this creator';
COMMENT ON COLUMN campaign_creators.admin_reply_at IS 'Timestamp when admin last replied to brand';
COMMENT ON COLUMN campaign_creators.brand_reply IS 'Latest brand reply to admin response about this creator';
COMMENT ON COLUMN campaign_creators.brand_reply_at IS 'Timestamp when brand last replied to admin';
COMMENT ON TABLE conversation_messages IS 'Detailed conversation history between brands and admins about specific creators';