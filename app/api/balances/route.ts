import { NextRequest, NextResponse } from "next/server";
import { getWalletBalances } from "@/lib/moralis";

// GET /api/balances?address=0x... — fetch live USDT + BNB balances for a wallet
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address param required" }, { status: 400 });
  }

  try {
    const balances = await getWalletBalances(address);
    return NextResponse.json(balances);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
