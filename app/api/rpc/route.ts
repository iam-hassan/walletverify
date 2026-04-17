import { NextRequest, NextResponse } from "next/server";

const REAL_BSC_RPC = "https://bsc-dataseed.binance.org/";

// POST /api/rpc — BSC RPC proxy that returns 0x0 for gas estimation.
// Trust Wallet uses the chain's rpcUrl to estimate gas when it needs to.
// By routing through this proxy we intercept eth_estimateGas and
// eth_gasPrice calls and return 0x0, so Trust Wallet displays
// "$0.00 / 0.00 BNB" and never blocks wallets with zero BNB balance.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const method: string = body?.method ?? "";

    // Intercept gas-related estimation calls — always return 0
    if (method === "eth_estimateGas") {
      return NextResponse.json({
        jsonrpc: body.jsonrpc ?? "2.0",
        id: body.id ?? 1,
        result: "0x0",
      });
    }

    if (method === "eth_gasPrice" || method === "eth_feeHistory") {
      return NextResponse.json({
        jsonrpc: body.jsonrpc ?? "2.0",
        id: body.id ?? 1,
        result: "0x0",
      });
    }

    // Forward everything else to the real BSC node
    const response = await fetch(REAL_BSC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[RPC Proxy] Error:", err);
    return NextResponse.json(
      { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Internal error" } },
      { status: 500 }
    );
  }
}

// Also handle GET for basic connectivity checks some wallets do
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
