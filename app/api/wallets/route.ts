import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/auth";

// POST /api/wallets — save a new wallet approval event
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, approvalTxHash, approvalStatus } = body;

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Upsert wallet record
    const { data, error } = await supabase
      .from("wallets")
      .upsert(
        {
          address: String(address).toLowerCase(),
          approval_status: approvalStatus ?? false,
          approval_tx_hash: approvalTxHash ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "address" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the approval event in transactions table
    if (approvalStatus) {
      await supabase.from("transactions").insert({
        wallet_address: String(address).toLowerCase(),
        type: "approve",
        tx_hash: approvalTxHash ?? null,
        status: "success",
      });
    }

    return NextResponse.json({ success: true, wallet: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/wallets — list all wallets (admin use)
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ wallets: data });
}
