# 🎯 DEMO SETUP - Quick Guide

The demo setup has been split into 4 parts to avoid network timeouts.

## Run These SQL Files in Order:

### In Supabase SQL Editor:

1. **Part 1** - `demo-setup-part1.sql`
   - Creates demo brand (TechStyle Fashion)
   - Creates Campaign 1: Summer Collection (Creator Selection Phase)
   - ✅ Wait for "Part 1 Complete" message

2. **Part 2** - `demo-setup-part2.sql`  
   - Creates Campaign 2: Festive Season Sale (Content Approval Phase)
   - ✅ Wait for "Part 2 Complete" message

3. **Part 3** - `demo-setup-part3.sql`
   - Creates Campaign 3: Smart Accessories (Analytics Phase)
   - ✅ Wait for "Part 3 Complete" message

4. **Part 4** - `demo-setup-part4.sql`
   - Adds performance analytics for Campaign 3
   - ✅ Shows final verification with all 3 campaigns

---

## Demo Credentials

- **Email:** `demo@campayn.com`
- **Password:** `Demo@2024`

---

## What You Get

### TechStyle Fashion Brand
- Industry: Fashion
- Size: 51-200 employees
- Budget: ₹100k-500k/month

### Campaign 1: 🎨 Summer Collection 2024 Launch
- **Status:** Creator Selection Phase
- **Budget:** ₹85,000
- **Creators:** 8 of 21 selected
- **Cost per Creator:** ₹3,900 (Micro tier)
- **Demo Focus:** Show AI recommendations & budget tracking

### Campaign 2: 🎃 Festive Season Sale
- **Status:** Content Approval Phase
- **Budget:** ₹1,10,000
- **Creators:** 12 paid (Macro tier @ ₹7,400)
- **Content:** 6 approved, 3 pending review, 3 need revision
- **Demo Focus:** Show content workflow & approval process

### Campaign 3: 🚀 Smart Accessories Launch
- **Status:** Analytics Monitoring Phase
- **Budget:** ₹1,45,000
- **Creators:** 10 paid (Mega tier @ ₹14,200)
- **Content:** All published
- **Performance:** Full analytics with engagement metrics
- **Demo Focus:** Show ROI and performance tracking

---

## Troubleshooting

### If SQL times out:
- Run one part at a time
- Wait 10 seconds between parts
- Check Supabase dashboard for slow queries

### If creators don't show:
- Make sure you have creators in your database
- Check the `creators` table has data
- Adjust the WHERE clauses if needed

### If campaigns don't appear:
- Verify brand was created: `SELECT * FROM brands WHERE id = '11111111-1111-1111-1111-111111111111'`
- Check for errors in Supabase logs
- Restart backend server

---

## Quick Start

```bash
# 1. Run all 4 SQL files in Supabase (in order)

# 2. Start backend
cd backend
npm run dev

# 3. Start frontend
cd ..
npm run dev

# 4. Login with demo@campayn.com / Demo@2024
```

---

## Demo Flow

1. **Start with Campaign 1** - Show creator selection
2. **Move to Campaign 3** - Show analytics (most impressive)
3. **End with Campaign 2** - Show content workflow (if time permits)

---

Good luck with your demo! 🚀
