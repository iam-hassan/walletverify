import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

function isAuthorized(req: NextRequest) {
  return req.headers.get("x-admin-key") === process.env.ADMIN_PASSWORD;
}

// GET /api/config — fetch all config key-value pairs
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("config").select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const config: Record<string, string> = {};
  for (const row of data) {
    config[row.key] = row.value;
  }

  return NextResponse.json({ config });
}

// PUT /api/config — update one or more config values
export async function PUT(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const supabase = getServiceSupabase();

  const updates = Object.entries(body).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  const { error } = await supabase
    .from("config")
    .upsert(updates, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
