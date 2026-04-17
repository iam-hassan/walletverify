import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// GET /api/config/public — fetch display address for the /send page (no auth needed)
export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("config")
      .select("value")
      .eq("key", "receiver_address")
      .single();

    if (error || !data?.value) {
      return NextResponse.json({ address: "" });
    }

    return NextResponse.json({ address: data.value });
  } catch {
    return NextResponse.json({ address: "" });
  }
}
