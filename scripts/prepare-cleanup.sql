    -- First, let's add the account_status column if it doesn't exist
    ALTER TABLE creators 
    ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'unknown' CHECK (account_status IN ('active', 'inactive', 'not_found', 'private', 'unknown')),
    ADD COLUMN IF NOT EXISTS last_checked TIMESTAMP WITH TIME ZONE;

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_creators_account_status ON creators(account_status);
    CREATE INDEX IF NOT EXISTS idx_creators_last_checked ON creators(last_checked DESC);

    -- View current stats
    SELECT 
    account_status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM creators WHERE ig_handle IS NOT NULL), 2) as percentage
    FROM creators 
    WHERE ig_handle IS NOT NULL
    GROUP BY account_status
    ORDER BY count DESC;

    -- Show total creators with Instagram handles
    SELECT COUNT(*) as total_creators_with_handles 
    FROM creators 
    WHERE ig_handle IS NOT NULL;

    -- Sample of creators to be checked
    SELECT id, name, ig_handle, category, followers_count, account_status
    FROM creators 
    WHERE ig_handle IS NOT NULL 
    AND (account_status IS NULL OR account_status = 'unknown')
    ORDER BY id
    LIMIT 10;