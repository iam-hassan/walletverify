import { NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// Cache password briefly to avoid hammering Supabase on every request
let cachedPassword: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getAdminPassword(): Promise<string | null> {
  const now = Date.now();
  if (cachedPassword && now < cacheExpiresAt) return cachedPassword;

  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("config")
      .select("value")
      .eq("key", "admin_password")
      .maybeSingle();
    if (data?.value) {
      cachedPassword = data.value;
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedPassword;
    }
  } catch { /* ignore */ }

  // Fall back to env var (never cache, so a Supabase entry can override later)
  return process.env.ADMIN_PASSWORD ?? null;
}

/** Call this after a password change to bust the in-process cache */
export function invalidatePasswordCache() {
  cachedPassword = null;
  cacheExpiresAt = 0;
}

export async function isAdminAuthorized(req: NextRequest): Promise<boolean> {
  const key = req.headers.get("x-admin-key");
  if (!key) return false;
  const expected = await getAdminPassword();
  return key === expected;
}
