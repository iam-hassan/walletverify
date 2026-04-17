import { NextRequest, NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/auth";

// GET /api/auth/verify — verify admin password
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  const expectedPassword = await getAdminPassword();

  if (!expectedPassword) {
    return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
  }

  if (adminKey === expectedPassword) {
    return NextResponse.json({ authenticated: true });
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
