# Database Migrations

## How to Run Migrations on Railway

### Fix Ever Booked Flag Migration

This migration ensures all bookings are properly tracked in daily activities by setting the `ever_booked` flag for all leads that have a `booked_at` timestamp.

**To run on Railway:**

1. Open Railway dashboard
2. Go to your CRM service
3. Click on "Settings" tab
4. Click on "Deploy" > "New Deployment"
5. Or use Railway CLI:

```bash
# SSH into Railway container
railway run bash

# Navigate to migrations folder
cd migrations

# Run the migration
node fix_ever_booked_flag.js
```

**Or run directly via Railway CLI:**

```bash
railway run node migrations/fix_ever_booked_flag.js
```

### What This Migration Does

- Finds all leads that have a `booked_at` timestamp but `ever_booked = false`
- Updates these leads to set `ever_booked = true`
- Ensures all historical bookings display correctly in the Daily Activities dashboard
- Safe to run multiple times (idempotent)

### When to Run

Run this migration:
- After deploying the daily activities tracking improvements
- If you notice bookings missing from the daily activities dashboard
- After any data import or restoration

