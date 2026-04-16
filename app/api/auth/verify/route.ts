import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/verify — verify admin password (simple auth check)
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return NextResponse.json(
      { error: "Admin password not configured" },
      { status: 500 }
    );
  }

  if (adminKey === expectedPassword) {
    return NextResponse.json({ authenticated: true });
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
