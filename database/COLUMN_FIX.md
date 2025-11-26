# Database Column Name Fix

## Issue
The SQL migration script was failing with:
```
ERROR: 42703: column "response_status" of relation "campaign_creators" does not exist
```

## Root Cause
The `campaign_creators` table uses a column named `status`, not `response_status`. The SQL script was referencing the wrong column name throughout.

## Files Fixed

### 1. `/backend/database/add-creator-selection-tracking.sql`
**Changed all references from `response_status` to `status`:**

- Line 43: `count_selected_creators()` function
- Line 78: `validate_creator_selection()` function  
- Lines 109-121: `update_selection_count()` trigger function
- Line 127: Trigger definition
- Line 176: `prepare_campaign_payment()` function
- Line 218: `campaign_payment_summary` view

### 2. `/backend/routes/creatorSelection.js`
**Updated API endpoints to use `status` instead of `response_status`:**

- Line 73: `selection-status` endpoint
- Line 143: `initiate-payment` endpoint
- Line 251: `payment-summary` endpoint
- Line 307: `complete-payment` endpoint

### 3. `/backend/routes/campaigns.js`
**Removed duplicate column update:**
- Line 343: Removed `response_status: status,` from update query

## Changes Summary

| Before | After |
|--------|-------|
| `response_status = 'approved'` | `status = 'approved'` |
| `WHERE response_status = 'approved'` | `WHERE status = 'approved'` |
| `UPDATE OF response_status` | `UPDATE OF status` |

## How to Run the Fixed Migration

**Option 1: Using the migration script**
```bash
cd backend/database
chmod +x run-migration.sh
./run-migration.sh
```

**Option 2: Manual execution**
```bash
cd backend/database
psql $DATABASE_URL -f add-creator-selection-tracking.sql
```

**Option 3: Using Supabase SQL Editor**
1. Open Supabase dashboard
2. Go to SQL Editor
3. Copy contents of `add-creator-selection-tracking.sql`
4. Click "Run"

## Verification

After running the migration, verify it worked:

```sql
-- Check new columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
  AND column_name IN (
    'estimated_cost_per_creator',
    'max_affordable_creators',
    'actual_creators_selected'
  );

-- Check new function exists
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'validate_creator_selection';

-- Check trigger was created
SELECT tgname, tgrelid::regclass 
FROM pg_trigger 
WHERE tgname = 'trigger_update_selection_count';

-- Check view was created
SELECT viewname 
FROM pg_views 
WHERE viewname = 'campaign_payment_summary';
```

## Expected Output

When the migration runs successfully, you should see:

```
✅ Creator Selection Tracking and Payment System Schema Created Successfully!
   - Added pricing columns to campaigns table
   - Added selection_status to campaign_creators table
   - Created validation functions for budget limits
   - Created payment preparation workflow
   - Created automated selection count triggers
```

## Testing the Fix

After migration, test the endpoints:

```bash
# Test validation
curl -X POST http://localhost:4000/api/campaigns/{campaign_id}/validate-selection \
  -H "Content-Type: application/json" \
  -d '{"creatorId": 12345}'

# Test selection status
curl http://localhost:4000/api/campaigns/{campaign_id}/selection-status
```

## Notes

- The `status` column is the primary status field in `campaign_creators`
- It can have values: `'recommended'`, `'approved'`, `'rejected'`, `'requested_more'`
- The new `selection_status` column tracks payment workflow: `'pending'`, `'selected'`, `'approved'`, `'rejected'`, `'paid'`
- Both columns work together to provide complete tracking

## Rollback (if needed)

If you need to rollback the migration:

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_selection_count ON campaign_creators;

-- Drop functions
DROP FUNCTION IF EXISTS update_selection_count();
DROP FUNCTION IF EXISTS prepare_campaign_payment(UUID, INTEGER);
DROP FUNCTION IF EXISTS validate_creator_selection(UUID, BIGINT);
DROP FUNCTION IF EXISTS count_selected_creators(UUID);

-- Drop view
DROP VIEW IF EXISTS campaign_payment_summary;

-- Remove columns
ALTER TABLE campaign_creators DROP COLUMN IF EXISTS selection_status;
ALTER TABLE campaigns DROP COLUMN IF EXISTS estimated_cost_per_creator;
ALTER TABLE campaigns DROP COLUMN IF EXISTS max_affordable_creators;
ALTER TABLE campaigns DROP COLUMN IF EXISTS actual_creators_selected;
ALTER TABLE campaigns DROP COLUMN IF EXISTS creators_approved_count;
ALTER TABLE campaigns DROP COLUMN IF EXISTS payment_initiated;
ALTER TABLE campaigns DROP COLUMN IF EXISTS payment_initiated_at;
```
