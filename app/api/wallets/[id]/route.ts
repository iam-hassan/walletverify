import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// PATCH /api/wallets/[id] — toggle wallet approval status (Approved ↔ Revoked)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { approval_status } = body;

  if (approval_status === undefined) {
    return NextResponse.json(
      { error: "approval_status field required" },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("wallets")
    .update({ approval_status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
