import { createClient } from "npm:@supabase/supabase-js@2";

const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = configuredOrigins.includes("*") || !origin
    ? "*"
    : configuredOrigins.includes(origin) ? origin : configuredOrigins[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-edit-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || configuredOrigins.includes("*") || configuredOrigins.includes(origin);
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

export function handleOptions(request: Request) {
  return new Response("ok", { headers: corsHeaders(request) });
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase server secrets are missing.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyEditSession(request: Request) {
  const token = request.headers.get("x-edit-token")?.trim();
  if (!token || token.length > 256) return null;
  const tokenHash = await sha256(token);
  const client = adminClient();
  const { data, error } = await client
    .from("edit_sessions")
    .select("id, expires_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return { client, sessionId: data.id as string, expiresAt: data.expires_at as string, tokenHash };
}

