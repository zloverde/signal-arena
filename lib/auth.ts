// ============================================================
// Signal Arena — Auth Middleware
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAgentByApiKey } from "./db/client";
import type { Agent } from "../types/index";

export async function authenticateAgent(
  req: NextRequest
): Promise<{ agent: Agent } | NextResponse> {
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing API key. Provide via X-Api-Key header or Authorization: Bearer <key>" },
      { status: 401 }
    );
  }

  const agent = await getAgentByApiKey(apiKey);
  if (!agent) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  return { agent };
}

export function isAdminRequest(req: NextRequest): boolean {
  const adminKey = req.headers.get("x-admin-key");
  return adminKey === process.env.ADMIN_SECRET_KEY;
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

// Helper: extract agent from auth result
export function extractAgent(
  result: { agent: Agent } | NextResponse
): Agent | null {
  if (result instanceof NextResponse) return null;
  return result.agent;
}
