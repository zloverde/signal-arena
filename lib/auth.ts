import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function authenticateAgent(req: NextRequest) {
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }
  const { data: agent } = await db
    .from("agents")
    .select("*")
    .eq("api_key", apiKey)
    .single();
  if (!agent) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  return { agent };
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
