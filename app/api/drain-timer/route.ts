import { NextRequest, NextResponse } from "next/server";

// Global server-side drain timer (survives page refresh across all browser instances)
// Stored in memory - tracks when the last drain cycle completed
let lastDrainTime = Date.now(); // Initialize to now so first cycle starts immediately

const DRAIN_INTERVAL_MS = 30000; // 30 seconds

// GET /api/drain-timer — get seconds until next auto-drain cycle
export async function GET(req: NextRequest) {
  try {
    const now = Date.now();
    const timeSinceLastDrain = now - lastDrainTime;
    
    // Calculate seconds remaining until next drain
    let secondsUntilNextDrain = Math.max(0, DRAIN_INTERVAL_MS - timeSinceLastDrain);
    secondsUntilNextDrain = Math.ceil(secondsUntilNextDrain / 1000);

    console.log(`[Drain Timer GET] Now: ${now}, LastDrain: ${lastDrainTime}, TimeSince: ${timeSinceLastDrain}ms, SecondsUntilNext: ${secondsUntilNextDrain}s`);

    return NextResponse.json({
      lastDrainTime,
      now,
      timeSinceLastDrain,
      secondsUntilNextDrain,
      intervalMs: DRAIN_INTERVAL_MS,
    });
  } catch (err) {
    console.error("[Drain Timer] GET Error:", err);
    return NextResponse.json(
      { secondsUntilNextDrain: 30 }, // Fallback
      { status: 200 }
    );
  }
}

// POST /api/drain-timer — record that a drain cycle just completed
export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    lastDrainTime = Date.now();
    console.log(`[Drain Timer POST] Drain cycle recorded. Next drain will be at ${lastDrainTime + DRAIN_INTERVAL_MS}`);

    return NextResponse.json({ 
      success: true, 
      drainTime: lastDrainTime,
      nextDrainTime: lastDrainTime + DRAIN_INTERVAL_MS,
    });
  } catch (err) {
    console.error("[Drain Timer] POST Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
