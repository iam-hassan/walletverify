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

  try {
    const body = await req.json();
    const supabase = getServiceSupabase();

    const entries = Object.entries(body).map(([key, value]) => ({
      key,
      value: String(value),
    }));

    // Use explicit insert/update instead of upsert to avoid edge‑case errors
    for (const entry of entries) {
      const { data: existing, error: selectError } = await supabase
        .from("config")
        .select("key")
        .eq("key", entry.key)
        .maybeSingle();

      if (selectError) {
        return NextResponse.json({ error: selectError.message }, { status: 500 });
      }

      if (!existing) {
        const { error: insertError } = await supabase
          .from("config")
          .insert(entry);
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      } else {
        const { error: updateError } = await supabase
          .from("config")
          .update({ value: entry.value })
          .eq("key", entry.key);
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
