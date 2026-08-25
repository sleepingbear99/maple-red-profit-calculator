import { handleOptions, json, originAllowed, verifyEditSession } from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!originAllowed(request)) return json(request, { error: "Origin not allowed" }, 403);
  const session = await verifyEditSession(request);
  if (!session) return json(request, { error: "수정 권한이 만료되었습니다." }, 401);
  return json(request, { valid: true, expiresAt: session.expiresAt });
});

