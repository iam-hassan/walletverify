import { NextRequest, NextResponse } from "next/server";
import { getGasPrice } from "@/lib/moralis";
import { isAdminAuthorized } from "@/lib/auth";

// GET /api/gas — fetch current BSC gas price estimate
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
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
