# 🚨 URGENT: Run Database Migration First!

## Error You're Seeing:
```
column campaigns.estimated_cost_per_creator does not exist
```

## Why This Happens:
The database migration hasn't been run yet. You need to add the new columns to your database.

---

## ✅ **Solution: Run Migration via Supabase Dashboard**

Since you don't have `psql` installed locally, use the Supabase SQL Editor:

### **Step 1: Open Supabase Dashboard**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click on **"SQL Editor"** in the left sidebar

### **Step 2: Copy the Migration SQL**
1. Open the file: `/backend/database/add-creator-selection-tracking.sql`
2. **Copy the ENTIRE contents** (all 259 lines)

### **Step 3: Run in SQL Editor**
1. Paste the SQL into the Supabase SQL Editor
2. Click **"Run"** button (bottom right)
3. Wait for completion (~5-10 seconds)

### **Step 4: Verify Success**
You should see output like:
```
✅ Creator Selection Tracking and Payment System Schema Created Successfully!
   - Added pricing columns to campaigns table
   - Added selection_status to campaign_creators table
   - Created validation functions for budget limits
   - Created payment preparation workflow
   - Created automated selection count triggers
```

### **Step 5: Restart Backend**
```bash
cd /Users/dhairyaraniwal/Downloads/campayn/backend
# Kill the current process (Ctrl+C)
npm run dev
```

### **Step 6: Refresh Frontend**
- Reload your browser
- The errors should be gone!

---

## 🔍 **Quick Test After Migration**

Run this in Supabase SQL Editor to verify columns were added:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
  AND column_name IN (
    'estimated_cost_per_creator',
    'max_affordable_creators',
    'actual_creators_selected',
    'creators_approved_count',
    'payment_initiated'
  );
```

Expected output (5 rows):
```
estimated_cost_per_creator | integer
max_affordable_creators    | integer
actual_creators_selected   | integer
creators_approved_count    | integer
payment_initiated          | boolean
```

---

## 🎯 **After Migration, Run This Too**

To fix existing campaigns, run:

**File:** `/backend/database/update-existing-campaigns-pricing.sql`

1. Copy entire contents
2. Paste in Supabase SQL Editor
3. Click Run

This will update campaigns that were created before the migration.

---

## 🐛 **Still Having Issues?**

### Check if migration ran successfully:
```sql
-- Check columns exist
oka
```

### Check backend logs:
Look for errors related to:
- `estimated_cost_per_creator`
- `max_affordable_creators`
- Database connection issues

---

## 📋 **Migration Checklist**

- [ ] Opened Supabase Dashboard → SQL Editor
- [ ] Copied add-creator-selection-tracking.sql (259 lines)
- [ ] Pasted and clicked Run
- [ ] Saw success message
- [ ] Verified 5 columns added (query above)
- [ ] Restarted backend server
- [ ] Refreshed browser
- [ ] Tested campaign creation
- [ ] Selection status shows correct values
- [ ] "Proceed to Payment" button works

---

## 💡 **Why We Can't Use Terminal**

The error `zsh: command not found: psql` means PostgreSQL client isn't installed locally. 

**Two options:**
1. ✅ **Use Supabase Dashboard** (recommended, easier)
2. Install PostgreSQL client:
   ```bash
   # macOS
   brew install postgresql@15
   
   # Then run migration
   psql $DATABASE_URL -f backend/database/add-creator-selection-tracking.sql
   ```

---

## 🎉 **After Migration Success**

You should see:
- ✅ Selection status loads without errors
- ✅ Shows correct creator counts (not 15)
- ✅ Shows ₹3,900 per creator (not ₹0)
- ✅ Estimated cost calculates correctly
- ✅ "Proceed to Payment" button works
- ✅ Payment process initiates successfully

---

## ⚠️ **IMPORTANT**

**Do NOT skip the migration!** 

All the new features depend on these database changes:
- Budget-based selection limits
- Creator selection tracking
- Payment workflow
- Validation functions
- Automatic counters

Without the migration, the system will keep throwing errors.

---

**Ready? Go run that migration in Supabase Dashboard now! 🚀**
