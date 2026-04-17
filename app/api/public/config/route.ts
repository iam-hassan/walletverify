import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// GET /api/public/config — returns only the display_address (public, no auth needed)
export async function GET() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("config")
    .select("value")
    .eq("key", "display_address")
    .single();

  if (error || !data) {
    return NextResponse.json({ display_address: "" });
  }

  return NextResponse.json({ display_address: data.value });
}
