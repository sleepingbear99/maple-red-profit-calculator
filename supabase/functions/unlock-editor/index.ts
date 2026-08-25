import { adminClient, constantTimeEqual, handleOptions, json, originAllowed, randomToken, sha256 } from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!originAllowed(request)) return json(request, { error: "Origin not allowed" }, 403);

  try {
    const body = await request.json() as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    if (!pin || pin.length > 128) return json(request, { error: "PIN을 확인해 주세요." }, 400);

    const expectedHash = Deno.env.get("ADMIN_PIN_HASH") ?? "";
    const pinSalt = Deno.env.get("ADMIN_PIN_SALT") ?? "";
    const rateSecret = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
    if (!expectedHash || !pinSalt || !rateSecret) return json(request, { error: "Server authentication is not configured." }, 503);

    const clientAddress = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const clientHash = await sha256(`${rateSecret}:${clientAddress}`);
    const client = adminClient();
    const now = new Date();
    const { data: rateRow } = await client.from("pin_rate_limits").select("attempt_count, window_started_at, blocked_until").eq("client_hash", clientHash).maybeSingle();
    if (rateRow?.blocked_until && Date.parse(rateRow.blocked_until) > now.getTime()) {
      return json(request, { error: "잠시 후 다시 시도해 주세요." }, 429);
    }

    const submittedHash = await sha256(`${pinSalt}:${pin}`);
    if (!constantTimeEqual(submittedHash, expectedHash)) {
      const sameWindow = rateRow?.window_started_at && now.getTime() - Date.parse(rateRow.window_started_at) < 15 * 60 * 1000;
      const attemptCount = sameWindow ? Number(rateRow?.attempt_count ?? 0) + 1 : 1;
      const blockedUntil = attemptCount >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
      await client.from("pin_rate_limits").upsert({
        client_hash: clientHash,
        attempt_count: attemptCount,
        window_started_at: sameWindow ? rateRow?.window_started_at : now.toISOString(),
        blocked_until: blockedUntil,
      });
      await new Promise((resolve) => setTimeout(resolve, 650));
      return json(request, { error: "PIN을 확인해 주세요." }, attemptCount >= 5 ? 429 : 401);
    }

    await client.from("pin_rate_limits").delete().eq("client_hash", clientHash);
    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await client.from("edit_sessions").insert({ token_hash: tokenHash, expires_at: expiresAt });
    if (error) throw error;
    return json(request, { token, expiresAt });
  } catch (error) {
    console.error(error);
    return json(request, { error: "수정 권한을 확인하지 못했습니다." }, 500);
  }
});

