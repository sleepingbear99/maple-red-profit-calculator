import { handleOptions, json, originAllowed, verifyEditSession } from "../_shared/common.ts";

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(value);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validSettingsData(value: unknown) {
  if (!plainObject(value) || !plainObject(value.values) || !plainObject(value.fieldUpdatedAt)) return false;
  const allowedKeys = new Set(["mesoPrice", "giftDiscount", "auctionFee", "mileageMode", "mileageWon", "includeMileageEarned", "showMileage"]);
  if (Object.keys(value.values).some((key) => !allowedKeys.has(key))) return false;
  if (Object.keys(value.fieldUpdatedAt).some((key) => !allowedKeys.has(key) || !validTimestamp(value.fieldUpdatedAt[key]))) return false;
  for (const [key, setting] of Object.entries(value.values)) {
    if (["mesoPrice", "giftDiscount", "auctionFee", "mileageWon"].includes(key) && !(typeof setting === "number" && Number.isFinite(setting) && setting >= 0)) return false;
    if (["includeMileageEarned", "showMileage"].includes(key) && typeof setting !== "boolean") return false;
    if (key === "mileageMode" && setting !== "none" && setting !== "direct") return false;
  }
  return true;
}

function validRow(row: unknown, idKey: "productId" | "componentId") {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const value = row as Record<string, unknown>;
  return validId(value[idKey]) && value.data && typeof value.data === "object" && !Array.isArray(value.data) && validTimestamp(value.updatedAt);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!originAllowed(request)) return json(request, { error: "Origin not allowed" }, 403);
  const session = await verifyEditSession(request);
  if (!session) return json(request, { error: "수정 권한이 만료되었습니다." }, 401);

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 1_500_000) return json(request, { error: "저장 데이터가 너무 큽니다." }, 413);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_500_000) return json(request, { error: "저장 데이터가 너무 큽니다." }, 413);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const settings = body.settings ?? null;
    const products = Array.isArray(body.products) ? body.products : [];
    const components = Array.isArray(body.components) ? body.components : [];
    if (products.length > 500 || components.length > 1500) return json(request, { error: "저장 항목이 너무 많습니다." }, 400);
    if (settings !== null) {
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) return json(request, { error: "설정 데이터가 올바르지 않습니다." }, 400);
      const row = settings as Record<string, unknown>;
      if (!validSettingsData(row.data) || !validTimestamp(row.updatedAt)) return json(request, { error: "설정 데이터가 올바르지 않습니다." }, 400);
    }
    if (!products.every((row) => validRow(row, "productId")) || !components.every((row) => validRow(row, "componentId"))) {
      return json(request, { error: "공유 데이터 형식이 올바르지 않습니다." }, 400);
    }

    const { error } = await session.client.rpc("merge_shared_payload", {
      p_settings: settings,
      p_products: products,
      p_components: components,
    });
    if (error) throw error;
    return json(request, { saved: true });
  } catch (error) {
    console.error(error);
    return json(request, { error: "공유 데이터를 저장하지 못했습니다." }, 500);
  }
});
