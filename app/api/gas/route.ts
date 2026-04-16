import { NextRequest, NextResponse } from "next/server";
import { getGasPrice } from "@/lib/moralis";

// GET /api/gas — fetch current BSC gas price estimate
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const gasInfo = await getGasPrice();
    return NextResponse.json(gasInfo);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
