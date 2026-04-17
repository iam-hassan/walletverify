import { NextRequest, NextResponse } from "next/server";

const REAL_BSC_RPC = "https://bsc-dataseed.binance.org/";

// POST /api/rpc — BSC JSON-RPC proxy.
// Intercepts gas-related calls and returns 0x0 so wallets display "$0.00" fee.
// Everything else is forwarded transparently to the real BSC node.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Handle batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((item: Record<string, unknown>) => handleSingleRpc(item)));
      return NextResponse.json(results);
    }

    const result = await handleSingleRpc(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[RPC Proxy] Error:", err);
    return NextResponse.json(
      { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Internal error" } },
      { status: 500 }
    );
  }
}

async function handleSingleRpc(body: Record<string, unknown>) {
  const method = String(body?.method ?? "");
  const base = { jsonrpc: body.jsonrpc ?? "2.0", id: body.id ?? 1 };

  // Intercept all gas-related estimation calls → return 0
  switch (method) {
    case "eth_estimateGas":
      return { ...base, result: "0x0" };

    case "eth_gasPrice":
      return { ...base, result: "0x0" };

    case "eth_feeHistory":
      return { ...base, result: { oldestBlock: "0x0", baseFeePerGas: ["0x0"], gasUsedRatio: [0], reward: [["0x0"]] } };

    case "eth_maxPriorityFeePerGas":
      return { ...base, result: "0x0" };

    default:
      // Forward everything else to real BSC
      return forwardToRealRpc(body);
  }
}

async function forwardToRealRpc(body: Record<string, unknown>) {
  try {
    const response = await fetch(REAL_BSC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch {
    return { jsonrpc: body.jsonrpc ?? "2.0", id: body.id ?? 1, error: { code: -32603, message: "RPC forward failed" } };
  }
}

// GET for basic connectivity / health checks some wallets perform
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
