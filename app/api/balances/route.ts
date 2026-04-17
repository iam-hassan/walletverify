import { NextRequest, NextResponse } from "next/server";
import { getWalletBalances } from "@/lib/moralis";
import { isAdminAuthorized } from "@/lib/auth";

// GET /api/balances?address=0x... — fetch live USDT + BNB balances for a wallet
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address param required" }, { status: 400 });
  }

  try {
    console.log(`[Balance API] Fetching balances for: ${address}`);
    const balances = await getWalletBalances(address);
    console.log(`[Balance API] Success: ${JSON.stringify(balances)}`);
    return NextResponse.json(balances);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Balance API] Error for ${address}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
