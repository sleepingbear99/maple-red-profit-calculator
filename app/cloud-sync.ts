export const EDITOR_TOKEN_KEY = "mapleRedEditorToken";
export const CLOUD_META_KEY = "mapleRedCloudMeta_v1";
export const PRE_CLOUD_BACKUP_KEY = "mapleRedPreCloudBackup_v1";

type CloudRow = {
  data: Record<string, unknown>;
  updatedAt: string;
};

export type SharedProductRow = CloudRow & { productId: string };
export type SharedComponentRow = CloudRow & { componentId: string };

export type SharedSnapshot = {
  empty: boolean;
  settings: CloudRow | null;
  products: SharedProductRow[];
  components: SharedComponentRow[];
};

export type SharedSavePayload = {
  settings?: CloudRow | null;
  products?: SharedProductRow[];
  components?: SharedComponentRow[];
};

type PublicCloudConfig = {
  url: string;
  publishableKey: string;
};

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const publicEnv = (import.meta as ImportMetaWithEnv).env ?? {};
const publicCloudConfig: PublicCloudConfig = {
  url: (publicEnv.VITE_SUPABASE_URL ?? "").replace(/\/$/, ""),
  publishableKey: publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? publicEnv.VITE_SUPABASE_ANON_KEY ?? "",
};

export const cloudConfigured = Boolean(publicCloudConfig.url && publicCloudConfig.publishableKey);

export class CloudRequestError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "CloudRequestError";
    this.status = status;
  }
}

function requestHeaders(extra: HeadersInit = {}) {
  return {
    apikey: publicCloudConfig.publishableKey,
    ...extra,
  };
}

async function checkedJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `클라우드 요청 실패 (${response.status})`;
    try {
      const body = await response.json() as { error?: unknown; message?: unknown };
      if (typeof body.error === "string") message = body.error;
      else if (typeof body.message === "string") message = body.message;
    } catch {
      // Keep the status-based message when an error body is not JSON.
    }
    throw new CloudRequestError(message, response.status);
  }
  return response.json() as Promise<T>;
}

async function restRows<T>(path: string): Promise<T[]> {
  const response = await fetch(`${publicCloudConfig.url}/rest/v1/${path}`, {
    headers: requestHeaders(),
    cache: "no-store",
  });
  return checkedJson<T[]>(response);
}

export async function fetchSharedSnapshot(): Promise<SharedSnapshot> {
  if (!cloudConfigured) return { empty: true, settings: null, products: [], components: [] };

  const [settingsRows, productRows, componentRows] = await Promise.all([
    restRows<{ data: Record<string, unknown>; updated_at: string }>("shared_settings?select=data,updated_at&id=eq.global&limit=1"),
    restRows<{ product_id: string; data: Record<string, unknown>; updated_at: string }>("product_overrides?select=product_id,data,updated_at"),
    restRows<{ component_id: string; data: Record<string, unknown>; updated_at: string }>("component_overrides?select=component_id,data,updated_at"),
  ]);

  const settings = settingsRows[0]
    ? { data: settingsRows[0].data, updatedAt: settingsRows[0].updated_at }
    : null;
  const products = productRows.map((row) => ({ productId: row.product_id, data: row.data, updatedAt: row.updated_at }));
  const components = componentRows.map((row) => ({ componentId: row.component_id, data: row.data, updatedAt: row.updated_at }));

  return {
    empty: !settings && products.length === 0 && components.length === 0,
    settings,
    products,
    components,
  };
}

async function callFunction<T>(name: string, body: unknown, editToken?: string): Promise<T> {
  if (!cloudConfigured) throw new CloudRequestError("클라우드가 설정되지 않았습니다.");
  const response = await fetch(`${publicCloudConfig.url}/functions/v1/${name}`, {
    method: "POST",
    headers: requestHeaders({
      "Content-Type": "application/json",
      ...(editToken ? { "x-edit-token": editToken } : {}),
    }),
    body: JSON.stringify(body),
  });
  return checkedJson<T>(response);
}

export async function unlockEditor(pin: string) {
  return callFunction<{ token: string; expiresAt: string }>("unlock-editor", { pin });
}

export async function validateEditorToken(token: string) {
  try {
    await callFunction<{ valid: true; expiresAt: string }>("validate-editor", {}, token);
    return true;
  } catch (error) {
    if (error instanceof CloudRequestError && [401, 403].includes(error.status ?? 0)) return false;
    throw error;
  }
}

export async function saveSharedPayload(token: string, payload: SharedSavePayload) {
  return callFunction<{ saved: true }>("save-shared-data", payload, token);
}

export async function revokeEditorToken(token: string) {
  return callFunction<{ revoked: true }>("revoke-editor", {}, token);
}
