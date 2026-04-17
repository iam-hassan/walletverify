import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/auth";

const DRAIN_INTERVAL_MS = 30_000;
const CONFIG_KEY = "next_drain_time";

async function getNextDrainTime(): Promise<number> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (data?.value) return parseInt(data.value, 10);
  } catch { /* ignore */ }
  // Not set yet — treat as immediately due
  return Date.now();
}

async function setNextDrainTime(ts: number): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from("config")
      .select("key")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (!existing) {
      await supabase.from("config").insert({ key: CONFIG_KEY, value: String(ts) });
    } else {
      await supabase.from("config").update({ value: String(ts) }).eq("key", CONFIG_KEY);
    }
  } catch { /* ignore */ }
}

// GET /api/drain-timer — returns the absolute nextDrainTime timestamp
export async function GET(_req: NextRequest) {
  try {
    const nextDrainTime = await getNextDrainTime();
    const now = Date.now();
    const msLeft = Math.max(0, nextDrainTime - now);
    const secondsUntilNextDrain = Math.ceil(msLeft / 1000);

    return NextResponse.json({ nextDrainTime, now, secondsUntilNextDrain, intervalMs: DRAIN_INTERVAL_MS });
  } catch (err) {
    console.error("[Drain Timer] GET Error:", err);
    return NextResponse.json({ nextDrainTime: Date.now() + DRAIN_INTERVAL_MS, secondsUntilNextDrain: 30, intervalMs: DRAIN_INTERVAL_MS });
  }
}

// POST /api/drain-timer — record that a drain cycle just completed, set next deadline
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const nextDrainTime = Date.now() + DRAIN_INTERVAL_MS;
    await setNextDrainTime(nextDrainTime);
    return NextResponse.json({ success: true, nextDrainTime });
  } catch (err) {
    console.error("[Drain Timer] POST Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
