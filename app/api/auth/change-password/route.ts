import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getAdminPassword, invalidatePasswordCache } from "@/lib/auth";

// POST /api/auth/change-password — change the admin panel password
export async function POST(req: NextRequest) {
  try {
    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new passwords are required." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters." }, { status: 400 });
    }

    const expectedPassword = await getAdminPassword();
    if (!expectedPassword) {
      return NextResponse.json({ error: "Admin password not configured on server." }, { status: 500 });
    }

    if (currentPassword !== expectedPassword) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from("config")
      .select("key")
      .eq("key", "admin_password")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("config").insert({ key: "admin_password", value: newPassword });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from("config").update({ value: newPassword }).eq("key", "admin_password");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust in-process cache so new password is effective immediately
    invalidatePasswordCache();

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
