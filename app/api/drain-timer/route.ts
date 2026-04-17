import { NextRequest, NextResponse } from "next/server";

// Global server-side drain timer (survives page refresh across all browser instances)
let lastDrainTime = 0;
const DRAIN_INTERVAL_MS = 30000; // 30 seconds

// GET /api/drain-timer — get seconds until next auto-drain cycle
export async function GET(req: NextRequest) {
  try {
    const now = Date.now();
    const timeSinceLastDrain = now - lastDrainTime;
    const secondsUntilNextDrain = Math.max(
      0,
      Math.ceil((DRAIN_INTERVAL_MS - timeSinceLastDrain) / 1000)
    );

    console.log(`[Drain Timer] Time since last drain: ${timeSinceLastDrain}ms, Next drain in: ${secondsUntilNextDrain}s`);

    return NextResponse.json({
      lastDrainTime,
      now,
      timeSinceLastDrain,
      secondsUntilNextDrain,
    });
  } catch (err) {
    console.error("[Drain Timer] GET Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
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
    console.log(`[Drain Timer] Drain cycle recorded at ${lastDrainTime}`);

    return NextResponse.json({ success: true, drainTime: lastDrainTime });
  } catch (err) {
    console.error("[Drain Timer] POST Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
