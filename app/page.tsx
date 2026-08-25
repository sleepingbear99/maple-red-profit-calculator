"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  CATEGORY_LABELS,
  CURRENT_PRODUCTS,
  INITIAL_DATA_COUNTS,
  PRODUCT_TAG_LABELS,
  SUBCATEGORY_LABELS,
  SUBCATEGORY_OPTIONS,
  type CatalogProduct,
  type ProductCategory,
  type ProductTag,
  type ProductStatus,
  type ProductStatusSource,
  type ProductSubcategory,
} from "./product-data";
import {
  CLOUD_META_KEY,
  EDITOR_TOKEN_KEY,
  PRE_CLOUD_BACKUP_KEY,
  CloudRequestError,
  cloudConfigured,
  fetchSharedSnapshot,
  revokeEditorToken,
  saveSharedPayload,
  unlockEditor,
  validateEditorToken,
  type SharedSavePayload,
  type SharedSnapshot,
} from "./cloud-sync";

type PriceBasis = "current" | "recent";
type CategoryFilter = "all" | ProductCategory;
type MileageFilter = "all" | "eligible" | "ineligible";
type ProfitFilter = "all" | "good" | "bad";
type SortKey = "base" | "mileage" | "cashAsc" | "cashDesc" | "name";

type Settings = {
  mesoPrice: number;
  giftDiscount: number;
  auctionFee: number;
  mileageMode: "none" | "direct";
  mileageWon: number;
  includeMileageEarned: boolean;
  showMileage: boolean;
};

type ComponentMarketPrice = {
  currentMarketPrice: number | null;
  recentTradePrice: number | null;
};

type ProductPriceData = {
  priceBasis: PriceBasis;
  componentPrices: Record<string, ComponentMarketPrice>;
  saleLimit: number | null;
  note: string;
  updatedAt: string;
};

type PriceDataMap = Record<string, ProductPriceData>;

type PlanItem = {
  id: string;
  productId: string;
  quantity: number;
  useMileage: boolean;
};

type ProductDraft = CatalogProduct & ProductPriceData & { isNew?: boolean };

type CloudSyncMeta = {
  version: 1;
  settingsUpdatedAt: Partial<Record<keyof Settings, string>>;
  productUpdatedAt: Record<string, string>;
  componentUpdatedAt: Record<string, string>;
  cloudMigrationVersion: number;
  pendingFullUpload: boolean;
};

type CloudStatus = "local" | "loading" | "synced" | "saving" | "offline" | "permission" | "migration";
type EditorAccess = "local" | "checking" | "readonly" | "unlocked";

type PendingCloudChanges = {
  settings: boolean;
  productIds: Set<string>;
  componentIds: Set<string>;
};

type BackupProductRecord = {
  productId: string;
  name: string;
  status: ProductStatus;
  statusSource: ProductStatusSource;
  saleStartAt: string | null;
  saleEndAt: string | null;
  checkedAt: string;
  priceBasis: PriceBasis;
  saleLimit: number | null;
  note: string;
  updatedAt: string;
  cashPrice?: number;
  mileage30Eligible?: boolean;
  customProduct?: CatalogProduct;
};

type BackupComponentRecord = ComponentMarketPrice & {
  componentId: string;
  productId: string;
  name: string;
};

type LocalBackupV1 = {
  backupType: "maple-red-profit-calculator";
  schemaVersion: 1;
  exportedAt: string;
  settings: Settings;
  products: Record<string, BackupProductRecord>;
  components: Record<string, BackupComponentRecord>;
  planner: {
    plan: PlanItem[];
    goalCash: number;
  };
};

type RestoreCandidate = {
  exportedAt: string;
  settings: Settings;
  products: CatalogProduct[];
  priceData: PriceDataMap;
  plan: PlanItem[];
  goalCash: number;
  productCount: number;
  componentCount: number;
};

const STORAGE_KEY = "red-work-profit-calculator-v1";
const STORAGE_VERSION = 9;
const MILEAGE_RATE = 0.05;
const BACKUP_TYPE = "maple-red-profit-calculator";
const BACKUP_SCHEMA_VERSION = 1;
const BEFORE_RESTORE_BACKUP_KEY = "mapleRedBeforeRestoreBackup_v1";

const EMPTY_CLOUD_META: CloudSyncMeta = {
  version: 1,
  settingsUpdatedAt: {},
  productUpdatedAt: {},
  componentUpdatedAt: {},
  cloudMigrationVersion: 0,
  pendingFullUpload: false,
};

const DEFAULT_SETTINGS: Settings = {
  mesoPrice: 1550,
  giftDiscount: 6,
  auctionFee: 5,
  mileageMode: "none",
  mileageWon: 0.7,
  includeMileageEarned: false,
  showMileage: true,
};

const DEFAULT_PRODUCTS = CURRENT_PRODUCTS;

const RENAMED_BUILT_IN_COMPONENT_IDS = new Set([
  "resistance-03-component-1",
  "resistance-04-component-1",
  "resistance-09-component-4",
  "resistance-10-component-4",
  "boss-22-component-1",
  "bundle-01-component-1",
  "bundle-02-component-1",
  "adventurer-19-component-1",
  "adventurer-19-component-3",
  "adventurer-20-component-1",
  "adventurer-20-component-3",
]);

const RENAMED_BUILT_IN_PRODUCT_IDS = new Set([
  "bundle-01",
  "bundle-02",
]);

const REQUIRED_BUILT_IN_EXCLUDED_COMPONENT_IDS = new Set([
  "adventurer-15-excluded-component-1",
  "adventurer-16-excluded-component-1",
  "adventurer-19-excluded-component-1",
  "adventurer-19-excluded-component-2",
  "adventurer-20-excluded-component-1",
  "adventurer-20-excluded-component-2",
]);

const PRODUCT_STATUS_OPTIONS: [ProductStatus, string][] = [
  ["active", "판매 중"],
  ["ended", "판매 종료"],
  ["upcoming", "판매 예정"],
  ["paused", "일시 판매 중지"],
  ["unavailable", "구매 불가"],
  ["unknown", "확인 필요"],
];

const PRODUCT_STATUS_LABELS = Object.fromEntries(PRODUCT_STATUS_OPTIONS) as Record<ProductStatus, string>;
const PRODUCT_STATUS_VALUES = PRODUCT_STATUS_OPTIONS.map(([value]) => value);
const PRODUCT_STATUS_SOURCE_VALUES: ProductStatusSource[] = ["manual", "automatic"];

type SavedProductRecord = Partial<CatalogProduct> & { active?: unknown };

function isProductStatus(value: unknown): value is ProductStatus {
  return typeof value === "string" && PRODUCT_STATUS_VALUES.includes(value as ProductStatus);
}

function isProductStatusSource(value: unknown): value is ProductStatusSource {
  return typeof value === "string" && PRODUCT_STATUS_SOURCE_VALUES.includes(value as ProductStatusSource);
}

function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && value in CATEGORY_LABELS;
}

function isProductSubcategory(value: unknown): value is ProductSubcategory {
  return typeof value === "string" && value in SUBCATEGORY_LABELS;
}

function isProductTag(value: unknown): value is ProductTag {
  return typeof value === "string" && value in PRODUCT_TAG_LABELS;
}

const LEGACY_CATEGORY_MAP: Record<string, ProductCategory | undefined> = {
  bundle: "random",
};

const LEGACY_SUBCATEGORY_MAP: Record<string, ProductSubcategory | undefined> = {
  ring: "utility",
  gift: "boutique",
  multiPack: "boutique",
  crystal: "lunaCrystal",
  scroll: "transferScroll",
  color: "prism",
  mixDye: "mixCoupon",
  mixLens: "mixCoupon",
};

function migrateCategory(value: unknown, fallback?: CatalogProduct): ProductCategory {
  if (isProductCategory(value)) return value;
  if (fallback) return fallback.category;
  if (typeof value === "string" && LEGACY_CATEGORY_MAP[value]) return LEGACY_CATEGORY_MAP[value];
  return "basic";
}

function migrateSubcategory(value: unknown, fallback?: CatalogProduct): ProductSubcategory {
  if (isProductSubcategory(value)) return value;
  if (fallback?.subcategory) return fallback.subcategory;
  if (typeof value === "string" && LEGACY_SUBCATEGORY_MAP[value]) return LEGACY_SUBCATEGORY_MAP[value];
  return "utility";
}

function normalizeSaleDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function savedStatus(item: SavedProductRecord): ProductStatus {
  if (isProductStatus(item.status)) return item.status;
  return item.active === false ? "ended" : "active";
}

function mergeSavedProduct(item: SavedProductRecord, fallback?: CatalogProduct): CatalogProduct | null {
  if (
    typeof item.id !== "string" || typeof item.name !== "string" ||
    typeof item.cashPrice !== "number" || typeof item.mileage30Eligible !== "boolean" ||
    !Array.isArray(item.components) || !Array.isArray(item.excludedComponents) ||
    typeof item.checkedAt !== "string"
  ) return null;

  const tags = Array.from(new Set<ProductTag>([
    ...(Array.isArray(item.tags) ? item.tags.filter(isProductTag) : fallback?.tags ?? []),
    ...(item.mileage30Eligible ? ["mileage30" as const] : []),
  ]));

  return {
    ...(fallback ?? {}),
    id: item.id,
    name: item.name,
    category: migrateCategory(item.category, fallback),
    subcategory: migrateSubcategory(item.subcategory, fallback),
    cashPrice: item.cashPrice,
    mileage30Eligible: item.mileage30Eligible,
    tags,
    status: savedStatus(item),
    saleStartAt: normalizeSaleDate(item.saleStartAt),
    saleEndAt: normalizeSaleDate(item.saleEndAt),
    statusSource: isProductStatusSource(item.statusSource) ? item.statusSource : "manual",
    components: item.components,
    excludedComponents: item.excludedComponents,
    checkedAt: item.checkedAt,
  };
}

function migrateBuiltInProduct(item: SavedProductRecord, fallback: CatalogProduct): CatalogProduct {
  const merged = mergeSavedProduct(item, fallback) ?? fallback;
  const fallbackComponents = new Map(fallback.components.map((component) => [component.id, component]));
  const components = merged.components.map((component) => {
    const replacement = fallbackComponents.get(component.id);
    return RENAMED_BUILT_IN_COMPONENT_IDS.has(component.id) && replacement
      ? { ...component, name: replacement.name }
      : component;
  });
  const excludedComponents = [...merged.excludedComponents];
  for (const component of fallback.excludedComponents) {
    if (
      REQUIRED_BUILT_IN_EXCLUDED_COMPONENT_IDS.has(component.id) &&
      !excludedComponents.some((candidate) => candidate.id === component.id)
    ) {
      excludedComponents.push(component);
    }
  }
  const tags = Array.from(new Set<ProductTag>([...fallback.tags, ...merged.tags]));
  return {
    ...merged,
    name: RENAMED_BUILT_IN_PRODUCT_IDS.has(merged.id) ? fallback.name : merged.name,
    category: fallback.category,
    subcategory: fallback.subcategory,
    tags,
    components,
    excludedComponents,
  };
}

function migrateCatalogProducts(_version: unknown, savedProducts: unknown): CatalogProduct[] {
  if (!Array.isArray(savedProducts)) return DEFAULT_PRODUCTS;
  const savedRecords = savedProducts.filter((value): value is SavedProductRecord => !!value && typeof value === "object");
  const savedById = new Map(savedRecords.filter((item) => typeof item.id === "string").map((item) => [item.id as string, item]));
  const defaultIds = new Set(DEFAULT_PRODUCTS.map((product) => product.id));
  const builtInProducts = DEFAULT_PRODUCTS.map((fallback) => {
    const saved = savedById.get(fallback.id);
    return saved ? migrateBuiltInProduct(saved, fallback) : fallback;
  });
  const customProducts = savedRecords
    .filter((item) => typeof item.id === "string" && item.id.startsWith("user-") && !defaultIds.has(item.id))
    .map((item) => mergeSavedProduct(item))
    .filter((item): item is CatalogProduct => item !== null);
  return [...builtInProducts, ...customProducts];
}

const BASIS_LABEL: Record<PriceBasis, string> = {
  current: "현재 최저가",
  recent: "최근 체결가",
};

const CATEGORY_FILTER_OPTIONS: [CategoryFilter, string][] = [
  ["all", "전체"],
  ["basic", "기본"],
  ["random", "확률형"],
  ["coupon", "쿠폰"],
  ["job", "직업 코디"],
  ["boss", "보스 코디"],
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function effectiveProductStatus(product: CatalogProduct): ProductStatus {
  if (product.statusSource !== "automatic") return product.status;
  const today = localDateKey();
  if (product.saleStartAt && today < product.saleStartAt) return "upcoming";
  if (product.saleEndAt && today > product.saleEndAt) return "ended";
  if (product.saleStartAt || product.saleEndAt) return "active";
  return product.status;
}

function isProductActive(product: CatalogProduct) {
  return effectiveProductStatus(product) === "active";
}

function safeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  return safeNumber(value);
}

function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatWon(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(Math.round(value))}원`;
}

function formatEok(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, 2)}억`;
}

function formatOptionalEok(value: number) {
  return value > 0 ? formatEok(value) : "—";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function emptyComponentMarketPrice(): ComponentMarketPrice {
  return {
    currentMarketPrice: null,
    recentTradePrice: null,
  };
}

function createEmptyProductPrice(product: CatalogProduct): ProductPriceData {
  return {
    priceBasis: "current",
    componentPrices: Object.fromEntries(product.components.map((component) => [component.id, emptyComponentMarketPrice()])),
    saleLimit: null,
    note: "",
    updatedAt: "",
  };
}

function createInitialPriceData(products: CatalogProduct[]): PriceDataMap {
  return Object.fromEntries(products.map((item) => [item.id, createEmptyProductPrice(item)]));
}

function getProductPrice(priceData: PriceDataMap, product: CatalogProduct) {
  return priceData[product.id] ?? createEmptyProductPrice(product);
}

function normalizeNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

type SavedComponentMarketPrice = Partial<ComponentMarketPrice> & { manuallyConfirmedPrice?: unknown };
type SavedProductPriceData = {
  priceBasis?: unknown;
  componentPrices?: Record<string, SavedComponentMarketPrice>;
  saleLimit?: unknown;
  note?: unknown;
  updatedAt?: unknown;
};

function normalizeProductPrice(product: CatalogProduct, saved?: SavedProductPriceData): ProductPriceData {
  const componentPrices = Object.fromEntries(product.components.map((component) => {
    const price = saved?.componentPrices?.[component.id];
    const currentMarketPrice = normalizeNullableNumber(price?.currentMarketPrice);
    return [component.id, {
      currentMarketPrice: currentMarketPrice ?? normalizeNullableNumber(price?.manuallyConfirmedPrice),
      recentTradePrice: normalizeNullableNumber(price?.recentTradePrice),
    }];
  }));
  return {
    priceBasis: saved?.priceBasis === "recent" ? "recent" : "current",
    componentPrices,
    saleLimit: normalizeNullableNumber(saved?.saleLimit),
    note: typeof saved?.note === "string" ? saved.note : "",
    updatedAt: typeof saved?.updatedAt === "string" ? saved.updatedAt : "",
  };
}

function normalizePriceData(products: CatalogProduct[], saved?: PriceDataMap): PriceDataMap {
  return Object.fromEntries(products.map((item) => [item.id, normalizeProductPrice(item, saved?.[item.id])]));
}

function migrateLegacyPriceData(products: CatalogProduct[], legacyProducts: unknown): PriceDataMap {
  const migrated = createInitialPriceData(products);
  if (!Array.isArray(legacyProducts)) return migrated;
  for (const item of products) {
    const legacy = legacyProducts.find((candidate) => candidate && typeof candidate === "object" && "name" in candidate && candidate.name === item.name);
    if (!legacy || typeof legacy !== "object") continue;
    const record = legacy as Record<string, unknown>;
    const component = item.components[0];
    migrated[item.id] = {
      priceBasis: record.priceBasis === "recent" ? "recent" : "current",
      componentPrices: {
        ...migrated[item.id].componentPrices,
        [component.id]: {
          currentMarketPrice: normalizeNullableNumber(record.currentPrice) ?? normalizeNullableNumber(record.directPrice),
          recentTradePrice: normalizeNullableNumber(record.recentPrice),
        },
      },
      saleLimit: normalizeNullableNumber(record.saleLimit),
      note: typeof record.note === "string" ? record.note : "",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    };
  }
  return migrated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseCloudMeta(value: string | null): CloudSyncMeta {
  if (!value) return { ...EMPTY_CLOUD_META, settingsUpdatedAt: {}, productUpdatedAt: {}, componentUpdatedAt: {} };
  try {
    const parsed = JSON.parse(value) as Partial<CloudSyncMeta>;
    return {
      version: 1,
      settingsUpdatedAt: isRecord(parsed.settingsUpdatedAt) ? parsed.settingsUpdatedAt as CloudSyncMeta["settingsUpdatedAt"] : {},
      productUpdatedAt: isRecord(parsed.productUpdatedAt) ? parsed.productUpdatedAt as Record<string, string> : {},
      componentUpdatedAt: isRecord(parsed.componentUpdatedAt) ? parsed.componentUpdatedAt as Record<string, string> : {},
      cloudMigrationVersion: typeof parsed.cloudMigrationVersion === "number" ? parsed.cloudMigrationVersion : 0,
      pendingFullUpload: parsed.pendingFullUpload === true,
    };
  } catch {
    return { ...EMPTY_CLOUD_META, settingsUpdatedAt: {}, productUpdatedAt: {}, componentUpdatedAt: {} };
  }
}

function timestampValue(value: unknown) {
  if (typeof value !== "string") return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function snapshotContainsPayload(snapshot: SharedSnapshot, payload: SharedSavePayload) {
  if (payload.settings) {
    if (!snapshot.settings || stableJson(snapshot.settings.data) !== stableJson(payload.settings.data)) return false;
  }
  const remoteProducts = new Map(snapshot.products.map((row) => [row.productId, row.data]));
  if ((payload.products ?? []).some((row) => stableJson(remoteProducts.get(row.productId)) !== stableJson(row.data))) return false;
  const remoteComponents = new Map(snapshot.components.map((row) => [row.componentId, row.data]));
  return !(payload.components ?? []).some((row) => stableJson(remoteComponents.get(row.componentId)) !== stableJson(row.data));
}

function hasMeaningfulLocalData(settings: Settings, products: CatalogProduct[], priceData: PriceDataMap) {
  if ((Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).some((key) => settings[key] !== DEFAULT_SETTINGS[key])) return true;
  if (products.length !== DEFAULT_PRODUCTS.length) return true;
  const defaultsById = new Map(DEFAULT_PRODUCTS.map((product) => [product.id, product]));
  if (products.some((product) => {
    const fallback = defaultsById.get(product.id);
    if (!fallback) return true;
    return product.name !== fallback.name || product.cashPrice !== fallback.cashPrice ||
      product.status !== fallback.status || product.statusSource !== fallback.statusSource ||
      product.saleStartAt !== fallback.saleStartAt || product.saleEndAt !== fallback.saleEndAt ||
      product.checkedAt !== fallback.checkedAt;
  })) return true;
  return Object.values(priceData).some((productPrice) => (
    productPrice.priceBasis !== "current" || productPrice.saleLimit !== null || productPrice.note.trim() !== "" ||
    Object.values(productPrice.componentPrices).some((componentPrice) => (
      componentPrice.currentMarketPrice !== null || componentPrice.recentTradePrice !== null
    ))
  ));
}

function mergeSharedSnapshot(
  snapshot: SharedSnapshot,
  currentSettings: Settings,
  currentProducts: CatalogProduct[],
  currentPriceData: PriceDataMap,
  currentMeta: CloudSyncMeta,
  preferCloud: boolean,
) {
  const nextSettings = { ...currentSettings };
  const nextProducts = currentProducts.map((product) => ({ ...product }));
  const nextPriceData = Object.fromEntries(Object.entries(currentPriceData).map(([id, productPrice]) => [id, {
    ...productPrice,
    componentPrices: { ...productPrice.componentPrices },
  }])) as PriceDataMap;
  const nextMeta: CloudSyncMeta = {
    ...currentMeta,
    settingsUpdatedAt: { ...currentMeta.settingsUpdatedAt },
    productUpdatedAt: { ...currentMeta.productUpdatedAt },
    componentUpdatedAt: { ...currentMeta.componentUpdatedAt },
    cloudMigrationVersion: 1,
    pendingFullUpload: false,
  };

  if (snapshot.settings) {
    const values = isRecord(snapshot.settings.data.values) ? snapshot.settings.data.values : snapshot.settings.data;
    const fieldUpdatedAt = isRecord(snapshot.settings.data.fieldUpdatedAt) ? snapshot.settings.data.fieldUpdatedAt : {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const remoteValue = values[key];
      const remoteUpdatedAt = typeof fieldUpdatedAt[key] === "string" ? fieldUpdatedAt[key] as string : snapshot.settings.updatedAt;
      const localUpdatedAt = nextMeta.settingsUpdatedAt[key];
      if (!preferCloud && timestampValue(remoteUpdatedAt) <= timestampValue(localUpdatedAt)) continue;
      if (typeof DEFAULT_SETTINGS[key] === "number" && typeof remoteValue !== "number") continue;
      if (typeof DEFAULT_SETTINGS[key] === "boolean" && typeof remoteValue !== "boolean") continue;
      if (typeof DEFAULT_SETTINGS[key] === "string" && typeof remoteValue !== "string") continue;
      Object.assign(nextSettings, { [key]: remoteValue });
      nextMeta.settingsUpdatedAt[key] = remoteUpdatedAt;
    }
  }

  const productIndex = new Map(nextProducts.map((product, index) => [product.id, index]));
  for (const row of snapshot.products) {
    if (!isRecord(row.data)) continue;
    let index = productIndex.get(row.productId);
    if (index !== undefined && !preferCloud && timestampValue(row.updatedAt) <= timestampValue(nextMeta.productUpdatedAt[row.productId])) continue;
    if (row.productId.startsWith("user-") && isRecord(row.data.catalogProduct)) {
      const cloudProduct = mergeSavedProduct(row.data.catalogProduct as SavedProductRecord);
      if (cloudProduct?.id === row.productId) {
        if (index === undefined) {
          index = nextProducts.length;
          productIndex.set(row.productId, index);
          nextProducts.push(cloudProduct);
          nextPriceData[row.productId] = createEmptyProductPrice(cloudProduct);
        } else {
          nextProducts[index] = cloudProduct;
        }
      }
    }
    if (index === undefined) continue;
    const product = nextProducts[index];
    const productPrice = nextPriceData[row.productId] ?? createEmptyProductPrice(product);
    const nextProduct = { ...product };
    if (isProductStatus(row.data.status)) nextProduct.status = row.data.status;
    if (isProductStatusSource(row.data.statusSource)) nextProduct.statusSource = row.data.statusSource;
    nextProduct.saleStartAt = normalizeSaleDate(row.data.saleStartAt);
    nextProduct.saleEndAt = normalizeSaleDate(row.data.saleEndAt);
    if (typeof row.data.checkedAt === "string") nextProduct.checkedAt = row.data.checkedAt;
    nextProducts[index] = nextProduct;
    nextPriceData[row.productId] = {
      ...productPrice,
      priceBasis: row.data.priceBasis === "recent" ? "recent" : "current",
      saleLimit: normalizeNullableNumber(row.data.saleLimit),
      note: typeof row.data.note === "string" ? row.data.note : "",
      updatedAt: row.updatedAt,
    };
    nextMeta.productUpdatedAt[row.productId] = row.updatedAt;
  }

  const componentOwner = new Map<string, string>();
  for (const product of nextProducts) {
    for (const component of product.components) componentOwner.set(component.id, product.id);
  }
  for (const row of snapshot.components) {
    const productId = componentOwner.get(row.componentId);
    if (!productId || !isRecord(row.data)) continue;
    if (!preferCloud && timestampValue(row.updatedAt) <= timestampValue(nextMeta.componentUpdatedAt[row.componentId])) continue;
    const product = nextProducts[productIndex.get(productId) ?? -1];
    if (!product) continue;
    const productPrice = nextPriceData[productId] ?? createEmptyProductPrice(product);
    nextPriceData[productId] = {
      ...productPrice,
      componentPrices: {
        ...productPrice.componentPrices,
        [row.componentId]: {
          currentMarketPrice: normalizeNullableNumber(row.data.currentMarketPrice),
          recentTradePrice: normalizeNullableNumber(row.data.recentTradePrice),
        },
      },
      updatedAt: timestampValue(row.updatedAt) > timestampValue(productPrice.updatedAt) ? row.updatedAt : productPrice.updatedAt,
    };
    nextMeta.componentUpdatedAt[row.componentId] = row.updatedAt;
  }

  return { settings: nextSettings, products: nextProducts, priceData: nextPriceData, meta: nextMeta };
}

const LEGACY_COMPONENT_NAME_MAP: Record<string, string> = {
  "모험가 캐논슈터 슈트(남)": "모험가 캐논슈터 갑옷(남)",
  "모험가 캐논슈터 슈트(여)": "모험가 캐논슈터 갑옷(여)",
  "모험가 캐논슈터 캐논": "모험가 캐논슈터 포탄",
};

function createLocalBackup(
  settings: Settings,
  products: CatalogProduct[],
  priceData: PriceDataMap,
  plan: PlanItem[],
  goalCash: number,
): LocalBackupV1 {
  const defaultsById = new Map(DEFAULT_PRODUCTS.map((product) => [product.id, product]));
  const productRecords: Record<string, BackupProductRecord> = {};
  const componentRecords: Record<string, BackupComponentRecord> = {};

  for (const product of products) {
    const fallback = defaultsById.get(product.id);
    const productPrice = getProductPrice(priceData, product);
    productRecords[product.id] = {
      productId: product.id,
      name: product.name,
      status: product.status,
      statusSource: product.statusSource,
      saleStartAt: product.saleStartAt ?? null,
      saleEndAt: product.saleEndAt ?? null,
      checkedAt: product.checkedAt,
      priceBasis: productPrice.priceBasis,
      saleLimit: productPrice.saleLimit,
      note: productPrice.note,
      updatedAt: productPrice.updatedAt,
      ...(!fallback || product.cashPrice !== fallback.cashPrice ? { cashPrice: product.cashPrice } : {}),
      ...(!fallback || product.mileage30Eligible !== fallback.mileage30Eligible ? { mileage30Eligible: product.mileage30Eligible } : {}),
      ...(product.id.startsWith("user-") ? { customProduct: product } : {}),
    };
    for (const component of product.components) {
      const componentPrice = productPrice.componentPrices[component.id] ?? emptyComponentMarketPrice();
      componentRecords[component.id] = {
        componentId: component.id,
        productId: product.id,
        name: component.name,
        currentMarketPrice: componentPrice.currentMarketPrice,
        recentTradePrice: componentPrice.recentTradePrice,
      };
    }
  }

  return {
    backupType: BACKUP_TYPE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    products: productRecords,
    components: componentRecords,
    planner: {
      plan: plan.map((item) => ({ ...item })),
      goalCash,
    },
  };
}

function normalizeBackupSettings(value: unknown, strict: boolean) {
  if (!isRecord(value)) return null;
  const next: Settings = { ...DEFAULT_SETTINGS };
  const numberKeys: (keyof Pick<Settings, "mesoPrice" | "giftDiscount" | "auctionFee" | "mileageWon">)[] = [
    "mesoPrice", "giftDiscount", "auctionFee", "mileageWon",
  ];
  const booleanKeys: (keyof Pick<Settings, "includeMileageEarned" | "showMileage">)[] = ["includeMileageEarned", "showMileage"];
  for (const key of numberKeys) {
    if (!(key in value)) {
      if (strict) return null;
      continue;
    }
    const setting = value[key];
    if (typeof setting !== "number" || !Number.isFinite(setting) || setting < 0) return null;
    if ((key === "giftDiscount" || key === "auctionFee") && setting > 100) return null;
    next[key] = setting;
  }
  for (const key of booleanKeys) {
    if (!(key in value)) {
      if (strict) return null;
      continue;
    }
    if (typeof value[key] !== "boolean") return null;
    next[key] = value[key];
  }
  if (!("mileageMode" in value)) {
    if (strict) return null;
  } else if (value.mileageMode === "none" || value.mileageMode === "direct") {
    next.mileageMode = value.mileageMode;
  } else {
    return null;
  }
  return next;
}

function validBackupPrice(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function normalizeBackupPlan(value: unknown, validProductIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PlanItem[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.productId !== "string" ||
      typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity < 0 ||
      typeof item.useMileage !== "boolean" || !validProductIds.has(item.productId)) return [];
    return [{ id: item.id, productId: item.productId, quantity: item.quantity, useMileage: item.useMileage }];
  });
}

function parseV1Backup(value: Record<string, unknown>): RestoreCandidate {
  const settings = normalizeBackupSettings(value.settings, true);
  if (!settings || !isRecord(value.products) || !isRecord(value.components)) throw new Error("invalid");

  const rawProducts = Object.entries(value.products);
  const customProducts: CatalogProduct[] = [];
  for (const [productId, rawProduct] of rawProducts) {
    if (!isRecord(rawProduct) || rawProduct.productId !== productId || typeof rawProduct.name !== "string" ||
      !isProductStatus(rawProduct.status) || !isProductStatusSource(rawProduct.statusSource) ||
      (rawProduct.priceBasis !== "current" && rawProduct.priceBasis !== "recent") ||
      typeof rawProduct.checkedAt !== "string" || typeof rawProduct.note !== "string" || typeof rawProduct.updatedAt !== "string" ||
      !validBackupPrice(rawProduct.saleLimit) ||
      (rawProduct.saleStartAt !== null && normalizeSaleDate(rawProduct.saleStartAt) === undefined) ||
      (rawProduct.saleEndAt !== null && normalizeSaleDate(rawProduct.saleEndAt) === undefined) ||
      (rawProduct.cashPrice !== undefined && !(typeof rawProduct.cashPrice === "number" && Number.isFinite(rawProduct.cashPrice) && rawProduct.cashPrice >= 0)) ||
      (rawProduct.mileage30Eligible !== undefined && typeof rawProduct.mileage30Eligible !== "boolean")) throw new Error("invalid");
    if (rawProduct.customProduct !== undefined) {
      if (!isRecord(rawProduct.customProduct)) throw new Error("invalid");
      const customProduct = mergeSavedProduct(rawProduct.customProduct as SavedProductRecord);
      if (!customProduct || customProduct.id !== productId || !productId.startsWith("user-")) throw new Error("invalid");
      customProducts.push(customProduct);
    }
  }

  let restoredProducts = migrateCatalogProducts(STORAGE_VERSION, [...DEFAULT_PRODUCTS, ...customProducts]);
  const recordsById = new Map(rawProducts.map(([id, record]) => [id, record as Record<string, unknown>]));
  restoredProducts = restoredProducts.map((product) => {
    const record = recordsById.get(product.id);
    if (!record) return product;
    return {
      ...product,
      status: record.status as ProductStatus,
      statusSource: record.statusSource as ProductStatusSource,
      saleStartAt: normalizeSaleDate(record.saleStartAt),
      saleEndAt: normalizeSaleDate(record.saleEndAt),
      checkedAt: record.checkedAt as string,
      cashPrice: typeof record.cashPrice === "number" ? record.cashPrice : product.cashPrice,
      mileage30Eligible: typeof record.mileage30Eligible === "boolean" ? record.mileage30Eligible : product.mileage30Eligible,
    };
  });

  const restoredPriceData = createInitialPriceData(restoredProducts);
  for (const product of restoredProducts) {
    const record = recordsById.get(product.id);
    if (!record) continue;
    restoredPriceData[product.id] = {
      ...restoredPriceData[product.id],
      priceBasis: record.priceBasis as PriceBasis,
      saleLimit: normalizeNullableNumber(record.saleLimit),
      note: record.note as string,
      updatedAt: record.updatedAt as string,
    };
  }

  const componentOwners = new Map<string, { productId: string; componentId: string }>();
  for (const product of restoredProducts) {
    for (const component of product.components) componentOwners.set(component.id, { productId: product.id, componentId: component.id });
  }
  const rawComponents = Object.entries(value.components);
  for (const [componentId, rawComponent] of rawComponents) {
    if (!isRecord(rawComponent) || rawComponent.componentId !== componentId || typeof rawComponent.productId !== "string" ||
      typeof rawComponent.name !== "string" || !validBackupPrice(rawComponent.currentMarketPrice) || !validBackupPrice(rawComponent.recentTradePrice)) {
      throw new Error("invalid");
    }
    let owner = componentOwners.get(componentId);
    if (!owner) {
      const product = restoredProducts.find((candidate) => candidate.id === rawComponent.productId);
      const migratedName = LEGACY_COMPONENT_NAME_MAP[rawComponent.name] ?? rawComponent.name;
      const component = product?.components.find((candidate) => candidate.name === migratedName);
      if (product && component) owner = { productId: product.id, componentId: component.id };
    }
    if (!owner) continue;
    const productPrice = restoredPriceData[owner.productId];
    productPrice.componentPrices[owner.componentId] = {
      currentMarketPrice: normalizeNullableNumber(rawComponent.currentMarketPrice),
      recentTradePrice: normalizeNullableNumber(rawComponent.recentTradePrice),
    };
  }

  const planner = isRecord(value.planner) ? value.planner : {};
  const validProductIds = new Set(restoredProducts.map((product) => product.id));
  const goalCash = typeof planner.goalCash === "number" && Number.isFinite(planner.goalCash) && planner.goalCash >= 0
    ? planner.goalCash
    : 1500000;
  return {
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    settings,
    products: restoredProducts,
    priceData: restoredPriceData,
    plan: normalizeBackupPlan(planner.plan, validProductIds),
    goalCash,
    productCount: rawProducts.length,
    componentCount: rawComponents.length,
  };
}

function parseLegacyBackup(value: Record<string, unknown>): RestoreCandidate {
  const legacyVersion = typeof value.version === "number" ? value.version : 1;
  if (!Number.isInteger(legacyVersion) || legacyVersion < 1 || !Array.isArray(value.products)) throw new Error("unsupported");
  const settings = normalizeBackupSettings(value.settings, false);
  if (!settings) throw new Error("invalid");
  const products = migrateCatalogProducts(legacyVersion, value.products);
  const priceData = legacyVersion >= 2
    ? normalizePriceData(products, isRecord(value.priceData) ? value.priceData as PriceDataMap : undefined)
    : migrateLegacyPriceData(products, value.products);
  const validProductIds = new Set(products.map((product) => product.id));
  return {
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    settings,
    products,
    priceData,
    plan: normalizeBackupPlan(value.plan, validProductIds),
    goalCash: typeof value.goalCash === "number" && Number.isFinite(value.goalCash) && value.goalCash >= 0 ? value.goalCash : 1500000,
    productCount: products.length,
    componentCount: products.reduce((total, product) => total + product.components.length, 0),
  };
}

function parseBackupCandidate(value: unknown): RestoreCandidate {
  if (!isRecord(value)) throw new Error("invalid");
  if ("backupType" in value && value.backupType !== BACKUP_TYPE) throw new Error("invalid");
  if (value.backupType === BACKUP_TYPE && value.schemaVersion === BACKUP_SCHEMA_VERSION) return parseV1Backup(value);
  if ((value.backupType === BACKUP_TYPE && value.schemaVersion === 0) || (!("backupType" in value) && typeof value.version === "number")) {
    return parseLegacyBackup(value);
  }
  throw new Error("unsupported");
}

function backupFileTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
}

function componentPriceForBasis(price: ComponentMarketPrice, basis: PriceBasis) {
  if (basis === "recent") return price.recentTradePrice ?? 0;
  return price.currentMarketPrice ?? 0;
}

function selectedPrice(product: CatalogProduct, priceData: ProductPriceData) {
  return product.components.reduce((total, component) => {
    const price = priceData.componentPrices[component.id] ?? emptyComponentMarketPrice();
    return total + componentPriceForBasis(price, priceData.priceBasis) * component.quantity;
  }, 0);
}

function aggregatePrice(product: CatalogProduct, priceData: ProductPriceData, basis: PriceBasis) {
  return product.components.reduce((total, component) => {
    const price = priceData.componentPrices[component.id] ?? emptyComponentMarketPrice();
    return total + componentPriceForBasis(price, basis) * component.quantity;
  }, 0);
}

function divergence(product: CatalogProduct, priceData: ProductPriceData) {
  const current = aggregatePrice(product, priceData, "current");
  const recent = aggregatePrice(product, priceData, "recent");
  if (current <= 0 || recent <= 0) return 0;
  return ((recent - current) / current) * 100;
}

function totalQuantity(product: CatalogProduct) {
  return product.components.reduce((sum, component) => sum + component.quantity, 0);
}

function excludedQuantity(product: CatalogProduct) {
  return product.excludedComponents.reduce((sum, component) => sum + component.quantity, 0);
}

function calculate(product: CatalogProduct, priceData: ProductPriceData, settings: Settings, mileage = false) {
  const useMileage = mileage && product.mileage30Eligible;
  const salePrice = selectedPrice(product, priceData);
  const netMeso = salePrice * (1 - settings.auctionFee / 100);
  const cashFace = product.cashPrice * (useMileage ? 0.7 : 1);
  const actualCash = cashFace * (1 - settings.giftDiscount / 100);
  const mileageUsed = useMileage ? product.cashPrice * 0.3 : 0;
  const earnedMileage = settings.includeMileageEarned ? cashFace * MILEAGE_RATE : 0;
  const mileageValue = settings.mileageMode === "direct" ? mileageUsed * settings.mileageWon : 0;
  const earnedValue = settings.mileageMode === "direct" ? earnedMileage * settings.mileageWon : 0;
  const economicCost = Math.max(actualCash + mileageValue - earnedValue, 0);
  const cashPerEok = netMeso > 0 ? actualCash / netMeso : Number.POSITIVE_INFINITY;
  const economicPerEok = netMeso > 0 ? economicCost / netMeso : Number.POSITIVE_INFINITY;
  const primaryPerEok = settings.mileageMode === "direct" ? economicPerEok : cashPerEok;
  const gapWon = Number.isFinite(primaryPerEok) ? settings.mesoPrice - primaryPerEok : 0;
  const gapPercent = settings.mesoPrice > 0 && Number.isFinite(primaryPerEok) ? (gapWon / settings.mesoPrice) * 100 : 0;

  return {
    salePrice,
    netMeso,
    cashFace,
    actualCash,
    mileageUsed,
    earnedMileage,
    mileageValue,
    earnedValue,
    economicCost,
    cashPerEok,
    economicPerEok,
    primaryPerEok,
    gapWon,
    gapPercent,
  };
}

function verdict(percent: number) {
  if (percent > 2) return { text: "유리", className: "positive" };
  if (percent < -2) return { text: "불리", className: "negative" };
  return { text: "본전 근처", className: "neutral" };
}

function newPlanId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `plan-${Date.now()}-${Math.random()}`;
}

function NumberField({
  label,
  value,
  suffix,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-control">
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(safeNumber(event.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

function CategoryBadges({ product }: { product: CatalogProduct }) {
  return (
    <span className="category-badges">
      <span className={`category-badge category-${product.category}`}>{CATEGORY_LABELS[product.category]}</span>
      {product.subcategory && <span className="subcategory-badge">{SUBCATEGORY_LABELS[product.subcategory]}</span>}
      {product.tags.filter((tag) => tag !== "mileage30" && tag !== "multiPack" && tag !== "freestyle").map((tag) => (
        <span className="product-tag-badge" key={tag}>{PRODUCT_TAG_LABELS[tag]}</span>
      ))}
    </span>
  );
}

function ProductStatusBadge({ product, showActive = false }: { product: CatalogProduct; showActive?: boolean }) {
  const status = effectiveProductStatus(product);
  if (status === "active" && !showActive) return null;
  return <span className={`sale-state status-${status}`}>{PRODUCT_STATUS_LABELS[status]}</span>;
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<CatalogProduct[]>(DEFAULT_PRODUCTS);
  const [priceData, setPriceData] = useState<PriceDataMap>(() => createInitialPriceData(DEFAULT_PRODUCTS));
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [goalCash, setGoalCash] = useState(1500000);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<"all" | ProductSubcategory>("all");
  const [mileageFilter, setMileageFilter] = useState<MileageFilter>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>("all");
  const [sort, setSort] = useState<SortKey>("base");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ProductDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(cloudConfigured ? "loading" : "local");
  const [editorAccess, setEditorAccess] = useState<EditorAccess>(cloudConfigured ? "checking" : "local");
  const [needsCloudMigration, setNeedsCloudMigration] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<RestoreCandidate | null>(null);
  const [restoreSharePromptOpen, setRestoreSharePromptOpen] = useState(false);
  const [restoreCloudConfirmOpen, setRestoreCloudConfirmOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(settings);
  const productsRef = useRef(products);
  const priceDataRef = useRef(priceData);
  const cloudMetaRef = useRef<CloudSyncMeta>({ ...EMPTY_CLOUD_META, settingsUpdatedAt: {}, productUpdatedAt: {}, componentUpdatedAt: {} });
  const pendingCloudChangesRef = useRef<PendingCloudChanges>({ settings: false, productIds: new Set(), componentIds: new Set() });
  const pendingEditRef = useRef<(() => void) | null>(null);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { priceDataRef.current = priceData; }, [priceData]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const nextSettings = parsed.settings ? { ...DEFAULT_SETTINGS, ...parsed.settings } : DEFAULT_SETTINGS;
        setSettings(nextSettings);
        settingsRef.current = nextSettings;
        const nextProducts = migrateCatalogProducts(parsed.version, parsed.products);
        setProducts(nextProducts);
        productsRef.current = nextProducts;
        const nextPriceData = parsed.version >= 2
          ? normalizePriceData(nextProducts, parsed.priceData)
          : migrateLegacyPriceData(nextProducts, parsed.products);
        setPriceData(nextPriceData);
        priceDataRef.current = nextPriceData;
        if (Array.isArray(parsed.plan)) {
          const validIds = new Set(nextProducts.map((item) => item.id));
          setPlan(parsed.plan.filter((item: PlanItem) => validIds.has(item.productId)));
        }
        if (typeof parsed.goalCash === "number") setGoalCash(parsed.goalCash);
      }
      cloudMetaRef.current = parseCloudMeta(window.localStorage.getItem(CLOUD_META_KEY));
    } catch {
      setNotice("저장된 데이터를 읽지 못해 기본값으로 시작했어요.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, settings, products, priceData, plan, goalCash }),
    );
  }, [settings, products, priceData, plan, goalCash, hydrated]);

  useEffect(() => {
    if (!hydrated || !cloudConfigured) return;
    let cancelled = false;

    const syncFromCloud = async () => {
      setCloudStatus("loading");
      const storedToken = window.localStorage.getItem(EDITOR_TOKEN_KEY);
      try {
        const snapshot = await fetchSharedSnapshot();
        if (cancelled) return;

        const meaningfulLocalData = hasMeaningfulLocalData(settingsRef.current, productsRef.current, priceDataRef.current);
        const meta = cloudMetaRef.current;
        if (snapshot.empty) {
          const needsMigration = meaningfulLocalData || meta.pendingFullUpload;
          setNeedsCloudMigration(needsMigration);
          setCloudStatus(needsMigration ? "migration" : "synced");
        } else if (meaningfulLocalData && meta.cloudMigrationVersion < 1) {
          setNeedsCloudMigration(true);
          setCloudStatus("migration");
        } else {
          const merged = mergeSharedSnapshot(
            snapshot,
            settingsRef.current,
            productsRef.current,
            priceDataRef.current,
            meta,
            !meaningfulLocalData,
          );
          settingsRef.current = merged.settings;
          productsRef.current = merged.products;
          priceDataRef.current = merged.priceData;
          cloudMetaRef.current = merged.meta;
          setSettings(merged.settings);
          setProducts(merged.products);
          setPriceData(merged.priceData);
          window.localStorage.setItem(CLOUD_META_KEY, JSON.stringify(merged.meta));
          setNeedsCloudMigration(false);
          setCloudStatus("synced");
        }

        if (storedToken) {
          try {
            const valid = await validateEditorToken(storedToken);
            if (cancelled) return;
            if (valid) {
              setEditorAccess("unlocked");
              const pending = pendingEditRef.current;
              pendingEditRef.current = null;
              pending?.();
              const dirty = pendingCloudChangesRef.current;
              if (dirty.settings || dirty.productIds.size || dirty.componentIds.size) queueCloudSave();
            } else {
              window.localStorage.removeItem(EDITOR_TOKEN_KEY);
              setEditorAccess("readonly");
              if (pendingEditRef.current) setPinModalOpen(true);
            }
          } catch {
            if (cancelled) return;
            setEditorAccess("unlocked");
            setCloudStatus("offline");
            const pending = pendingEditRef.current;
            pendingEditRef.current = null;
            pending?.();
            if (pending) setNotice("클라우드에 연결할 수 없어 이 기기에만 저장했습니다.");
          }
        } else {
          setEditorAccess("readonly");
          if (pendingEditRef.current) setPinModalOpen(true);
        }
      } catch {
        if (cancelled) return;
        setCloudStatus("offline");
        setEditorAccess(storedToken ? "unlocked" : "readonly");
        const pending = pendingEditRef.current;
        pendingEditRef.current = null;
        pending?.();
        if (pending) setNotice("클라우드에 연결할 수 없어 이 기기에만 저장했습니다.");
      }
    };

    void syncFromCloud();
    const reconnect = () => { void syncFromCloud(); };
    window.addEventListener("online", reconnect);
    return () => {
      cancelled = true;
      window.removeEventListener("online", reconnect);
    };
  }, [hydrated]);

  useEffect(() => {
    const preventNumberInputWheel = (event: WheelEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.type === "number" &&
        document.activeElement === target
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener("wheel", preventNumberInputWheel, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", preventNumberInputWheel, true);
  }, []);

  useEffect(() => () => {
    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!pinModalOpen) return;
    const frame = window.requestAnimationFrame(() => pinInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pinModalOpen]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailId(null);
        setEditor(null);
        setPinModalOpen(false);
        setPinValue("");
        setPinError("");
        pendingEditRef.current = null;
        setRestoreCandidate(null);
        setRestoreSharePromptOpen(false);
        setRestoreCloudConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const rankedProducts = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ko-KR");
    return products
      .filter((product) => {
        const productPrice = getProductPrice(priceData, product);
        const base = calculate(product, productPrice, settings);
        const searchableText = [
          product.name,
          CATEGORY_LABELS[product.category],
          product.subcategory ? SUBCATEGORY_LABELS[product.subcategory] : "",
          ...product.tags.map((tag) => PRODUCT_TAG_LABELS[tag]),
          ...product.components.map((component) => component.name),
          ...product.excludedComponents.map((component) => component.name),
        ].join(" ").toLocaleLowerCase("ko-KR");
        const matchSearch = !normalized || searchableText.includes(normalized);
        if (!matchSearch) return false;
        if (categoryFilter !== "all" && product.category !== categoryFilter) return false;
        if (subcategoryFilter !== "all" && product.subcategory !== subcategoryFilter) return false;
        if (mileageFilter === "eligible" && !product.mileage30Eligible) return false;
        if (mileageFilter === "ineligible" && product.mileage30Eligible) return false;
        if (activeOnly && !isProductActive(product)) return false;
        if (profitFilter === "good" && !(base.salePrice > 0 && base.gapPercent > 2)) return false;
        if (profitFilter === "bad" && !(base.salePrice > 0 && base.gapPercent < -2)) return false;
        return true;
      })
      .sort((a, b) => {
        const aEnded = effectiveProductStatus(a) === "ended" ? 1 : 0;
        const bEnded = effectiveProductStatus(b) === "ended" ? 1 : 0;
        if (aEnded !== bEnded) return aEnded - bEnded;
        const aPrice = getProductPrice(priceData, a);
        const bPrice = getProductPrice(priceData, b);
        const aBase = calculate(a, aPrice, settings);
        const bBase = calculate(b, bPrice, settings);
        if (sort === "mileage") {
          const aValue = a.mileage30Eligible ? calculate(a, aPrice, settings, true).primaryPerEok : Number.POSITIVE_INFINITY;
          const bValue = b.mileage30Eligible ? calculate(b, bPrice, settings, true).primaryPerEok : Number.POSITIVE_INFINITY;
          return aValue - bValue;
        }
        if (sort === "cashAsc") return a.cashPrice - b.cashPrice;
        if (sort === "cashDesc") return b.cashPrice - a.cashPrice;
        if (sort === "name") return a.name.localeCompare(b.name, "ko-KR");
        return aBase.primaryPerEok - bBase.primaryPerEok;
      });
  }, [products, priceData, search, categoryFilter, subcategoryFilter, mileageFilter, activeOnly, profitFilter, sort, settings]);

  useEffect(() => {
    if (expandedProductId && !rankedProducts.some((product) => product.id === expandedProductId)) {
      setExpandedProductId(null);
    }
  }, [expandedProductId, rankedProducts]);

  const bestProduct = useMemo(() => {
    return products
      .filter((product) => isProductActive(product) && selectedPrice(product, getProductPrice(priceData, product)) > 0)
      .sort((a, b) => calculate(a, getProductPrice(priceData, a), settings).primaryPerEok - calculate(b, getProductPrice(priceData, b), settings).primaryPerEok)[0];
  }, [products, priceData, settings]);

  const detailProduct = products.find((product) => product.id === detailId) ?? null;

  const planTotals = useMemo(() => {
    return plan.reduce(
      (totals, item) => {
        const product = products.find((candidate) => candidate.id === item.productId);
        if (!product) return totals;
        const useMileage = item.useMileage && product.mileage30Eligible;
        const result = calculate(product, getProductPrice(priceData, product), settings, useMileage);
        const quantity = Math.max(0, item.quantity);
        totals.cashPurchased += product.cashPrice * quantity;
        totals.actualCash += result.actualCash * quantity;
        totals.economicCost += result.economicCost * quantity;
        totals.mileageUsed += result.mileageUsed * quantity;
        totals.earnedMileage += result.earnedMileage * quantity;
        totals.netMeso += result.netMeso * quantity;
        return totals;
      },
      { cashPurchased: 0, actualCash: 0, economicCost: 0, mileageUsed: 0, earnedMileage: 0, netMeso: 0 },
    );
  }, [plan, products, priceData, settings]);

  const planMarketValue = planTotals.netMeso * settings.mesoPrice;
  const planCost = settings.mileageMode === "direct" ? planTotals.economicCost : planTotals.actualCash;
  const planDifference = planMarketValue - planCost;
  const planPercent = planMarketValue > 0 ? (planDifference / planMarketValue) * 100 : 0;
  const remainingGoal = Math.max(goalCash - planTotals.cashPurchased, 0);
  const goalProgress = goalCash > 0 ? Math.min((planTotals.cashPurchased / goalCash) * 100, 100) : 0;

  const persistCloudMeta = (meta: CloudSyncMeta) => {
    cloudMetaRef.current = meta;
    window.localStorage.setItem(CLOUD_META_KEY, JSON.stringify(meta));
  };

  const buildSharedSavePayload = (full: boolean, meta = cloudMetaRef.current): SharedSavePayload => {
    const pending = pendingCloudChangesRef.current;
    const productIds = full ? new Set(productsRef.current.map((product) => product.id)) : pending.productIds;
    const componentIds = full
      ? new Set(productsRef.current.flatMap((product) => product.components.map((component) => component.id)))
      : pending.componentIds;
    const settingsTimes = Object.values(meta.settingsUpdatedAt).filter((value): value is string => typeof value === "string");
    const settingsUpdatedAt = settingsTimes.sort().at(-1) ?? new Date().toISOString();
    const completeSettingsTimes = Object.fromEntries(
      (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((key) => [key, meta.settingsUpdatedAt[key] ?? new Date(0).toISOString()]),
    );
    const productsById = new Map(productsRef.current.map((product) => [product.id, product]));
    const componentOwner = new Map<string, string>();
    for (const product of productsRef.current) {
      for (const component of product.components) componentOwner.set(component.id, product.id);
    }

    return {
      settings: full || pending.settings ? {
        data: { values: settingsRef.current, fieldUpdatedAt: completeSettingsTimes },
        updatedAt: settingsUpdatedAt,
      } : null,
      products: Array.from(productIds).flatMap((productId) => {
        const product = productsById.get(productId);
        if (!product) return [];
        const productPrice = getProductPrice(priceDataRef.current, product);
        return [{
          productId,
          data: {
            ...(product.id.startsWith("user-") ? { catalogProduct: product } : {}),
            status: product.status,
            statusSource: product.statusSource,
            saleStartAt: product.saleStartAt ?? null,
            saleEndAt: product.saleEndAt ?? null,
            checkedAt: product.checkedAt,
            priceBasis: productPrice.priceBasis,
            saleLimit: productPrice.saleLimit,
            note: productPrice.note,
          },
          updatedAt: meta.productUpdatedAt[productId] ?? new Date().toISOString(),
        }];
      }),
      components: Array.from(componentIds).flatMap((componentId) => {
        const productId = componentOwner.get(componentId);
        const product = productId ? productsById.get(productId) : null;
        if (!productId || !product) return [];
        const componentPrice = getProductPrice(priceDataRef.current, product).componentPrices[componentId] ?? emptyComponentMarketPrice();
        return [{
          componentId,
          data: componentPrice,
          updatedAt: meta.componentUpdatedAt[componentId] ?? new Date().toISOString(),
        }];
      }),
    };
  };

  function queueCloudSave() {
    if (!cloudConfigured) return;
    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = window.setTimeout(() => { void flushCloudChanges(); }, 800);
  }

  async function flushCloudChanges() {
    const token = window.localStorage.getItem(EDITOR_TOKEN_KEY);
    if (!token) {
      setCloudStatus((current) => current === "offline" ? current : "permission");
      return;
    }
    const pending = pendingCloudChangesRef.current;
    if (!pending.settings && pending.productIds.size === 0 && pending.componentIds.size === 0) return;
    const captured: PendingCloudChanges = {
      settings: pending.settings,
      productIds: new Set(pending.productIds),
      componentIds: new Set(pending.componentIds),
    };
    const payload = buildSharedSavePayload(false);
    pendingCloudChangesRef.current = { settings: false, productIds: new Set(), componentIds: new Set() };
    setCloudStatus("saving");
    try {
      await saveSharedPayload(token, payload);
      setCloudStatus("synced");
      const remaining = pendingCloudChangesRef.current;
      if (remaining.settings || remaining.productIds.size || remaining.componentIds.size) queueCloudSave();
    } catch (error) {
      const remaining = pendingCloudChangesRef.current;
      remaining.settings = remaining.settings || captured.settings;
      captured.productIds.forEach((id) => remaining.productIds.add(id));
      captured.componentIds.forEach((id) => remaining.componentIds.add(id));
      if (error instanceof CloudRequestError && [401, 403].includes(error.status ?? 0)) {
        window.localStorage.removeItem(EDITOR_TOKEN_KEY);
        setEditorAccess("readonly");
        setCloudStatus("permission");
        setNotice("수정 권한이 만료되었습니다. 로컬 데이터는 유지됩니다.");
      } else {
        setCloudStatus("offline");
        setNotice("클라우드 저장 실패 · 로컬에는 저장되었습니다.");
      }
    }
  }

  const markSettingsChanged = (key: keyof Settings) => {
    const now = new Date().toISOString();
    persistCloudMeta({
      ...cloudMetaRef.current,
      settingsUpdatedAt: { ...cloudMetaRef.current.settingsUpdatedAt, [key]: now },
    });
    pendingCloudChangesRef.current.settings = true;
    queueCloudSave();
  };

  const markProductChanged = (productId: string) => {
    const now = new Date().toISOString();
    persistCloudMeta({
      ...cloudMetaRef.current,
      productUpdatedAt: { ...cloudMetaRef.current.productUpdatedAt, [productId]: now },
    });
    pendingCloudChangesRef.current.productIds.add(productId);
    queueCloudSave();
  };

  const markComponentChanged = (componentId: string) => {
    const now = new Date().toISOString();
    persistCloudMeta({
      ...cloudMetaRef.current,
      componentUpdatedAt: { ...cloudMetaRef.current.componentUpdatedAt, [componentId]: now },
    });
    pendingCloudChangesRef.current.componentIds.add(componentId);
    queueCloudSave();
  };

  const requestSharedEdit = (action: () => void) => {
    if (!cloudConfigured || editorAccess === "local" || editorAccess === "unlocked") {
      action();
      return;
    }
    if (cloudStatus === "offline") {
      action();
      return;
    }
    pendingEditRef.current = action;
    if (editorAccess !== "checking") {
      setPinError("");
      setPinModalOpen(true);
    }
  };

  const handlePinSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pinValue.trim() || pinSubmitting) return;
    setPinSubmitting(true);
    setPinError("");
    try {
      const result = await unlockEditor(pinValue.trim());
      window.localStorage.setItem(EDITOR_TOKEN_KEY, result.token);
      setEditorAccess("unlocked");
      setPinValue("");
      setPinModalOpen(false);
      setCloudStatus(needsCloudMigration ? "migration" : "synced");
      const pending = pendingEditRef.current;
      pendingEditRef.current = null;
      pending?.();
      setNotice("이 기기에서 수정이 활성화되었습니다.");
    } catch (error) {
      setPinError(error instanceof CloudRequestError && error.status === 429
        ? "인증 시도가 많습니다. 잠시 후 다시 시도해 주세요."
        : "PIN을 확인해 주세요.");
    } finally {
      setPinSubmitting(false);
    }
  };

  const cancelPin = () => {
    pendingEditRef.current = null;
    setPinValue("");
    setPinError("");
    setPinModalOpen(false);
  };

  const continueLocalOnly = () => {
    const pending = pendingEditRef.current;
    pendingEditRef.current = null;
    setPinModalOpen(false);
    setPinError("");
    pending?.();
    setNotice("클라우드에 연결할 수 없어 이 기기에만 저장했습니다.");
  };

  const uploadCurrentData = async (successMessage = "현재 데이터로 공유를 시작했습니다.") => {
    const token = window.localStorage.getItem(EDITOR_TOKEN_KEY);
    if (!token) {
      setCloudStatus("permission");
      return;
    }
    const existingBackup = window.localStorage.getItem(PRE_CLOUD_BACKUP_KEY);
    const currentLocalData = window.localStorage.getItem(STORAGE_KEY);
    if (!existingBackup && currentLocalData) window.localStorage.setItem(PRE_CLOUD_BACKUP_KEY, currentLocalData);

    const now = new Date().toISOString();
    const nextMeta: CloudSyncMeta = {
      version: 1,
      settingsUpdatedAt: Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((key) => [key, now])),
      productUpdatedAt: Object.fromEntries(productsRef.current.map((product) => [product.id, now])),
      componentUpdatedAt: Object.fromEntries(productsRef.current.flatMap((product) => product.components.map((component) => [component.id, now]))),
      cloudMigrationVersion: 0,
      pendingFullUpload: true,
    };
    persistCloudMeta(nextMeta);
    setCloudStatus("saving");
    try {
      const payload = buildSharedSavePayload(true, nextMeta);
      await saveSharedPayload(token, payload);
      const verification = await fetchSharedSnapshot();
      if (verification.empty || !snapshotContainsPayload(verification, payload)) throw new Error("cloud snapshot verification failed");
      const completedMeta = { ...nextMeta, cloudMigrationVersion: 1, pendingFullUpload: false };
      persistCloudMeta(completedMeta);
      setNeedsCloudMigration(false);
      setCloudStatus("synced");
      setNotice(successMessage);
    } catch (error) {
      if (error instanceof CloudRequestError && [401, 403].includes(error.status ?? 0)) {
        window.localStorage.removeItem(EDITOR_TOKEN_KEY);
        setEditorAccess("readonly");
        setCloudStatus("permission");
      } else {
        setCloudStatus("offline");
      }
      setNotice("공유 시작에 실패했습니다. 기존 데이터는 이 기기에 그대로 보존됩니다.");
    }
  };

  const startCloudMigration = () => requestSharedEdit(() => { void uploadCurrentData(); });

  const releaseEditorAccess = async () => {
    const token = window.localStorage.getItem(EDITOR_TOKEN_KEY);
    if (!token) {
      setEditorAccess("readonly");
      return;
    }
    try {
      await revokeEditorToken(token);
      window.localStorage.removeItem(EDITOR_TOKEN_KEY);
      setEditorAccess("readonly");
      setNotice("이 기기의 수정 권한을 해제했습니다.");
    } catch {
      setNotice("수정 권한 해제에 실패했습니다. 연결을 확인해 주세요.");
    }
  };

  const updateSettings = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    requestSharedEdit(() => {
      setSettings((current) => ({ ...current, [key]: value }));
      markSettingsChanged(key);
    });
  };

  const updateProduct = (id: string, changes: Partial<CatalogProduct>) => {
    requestSharedEdit(() => {
      setProducts((current) => current.map((product) => (product.id === id ? { ...product, ...changes } : product)));
      markProductChanged(id);
    });
  };

  const updateProductPrice = (id: string, changes: Partial<ProductPriceData>) => {
    const product = products.find((candidate) => candidate.id === id);
    if (!product) return;
    requestSharedEdit(() => {
      setPriceData((current) => ({
        ...current,
        [id]: { ...getProductPrice(current, product), ...changes, updatedAt: new Date().toISOString() },
      }));
      markProductChanged(id);
    });
  };

  const updateComponentMarketPrice = (
    productId: string,
    componentId: string,
    key: keyof ComponentMarketPrice,
    value: number | null,
  ) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;
    requestSharedEdit(() => {
      setPriceData((current) => {
        const currentProductPrice = getProductPrice(current, product);
        return {
          ...current,
          [productId]: {
            ...currentProductPrice,
            componentPrices: {
              ...currentProductPrice.componentPrices,
              [componentId]: {
                ...(currentProductPrice.componentPrices[componentId] ?? emptyComponentMarketPrice()),
                [key]: value,
              },
            },
            updatedAt: new Date().toISOString(),
          },
        };
      });
      markComponentChanged(componentId);
    });
  };

  const toggleProduct = (id: string) => {
    setExpandedProductId((current) => current === id ? null : id);
  };

  const toggleProductWithKeyboard = (event: ReactKeyboardEvent, id: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleProduct(id);
  };

  const openNewProduct = () => {
    const id = `user-${newPlanId()}`;
    setEditor({
      id,
      name: "",
      category: "basic",
      subcategory: "utility",
      cashPrice: 0,
      mileage30Eligible: false,
      tags: [],
      status: "active",
      statusSource: "manual",
      components: [{ id: `${id}-component-1`, name: "", quantity: 1 }],
      excludedComponents: [],
      checkedAt: new Date().toISOString().slice(0, 10),
      ...createEmptyProductPrice({
        id,
        name: "",
        category: "basic",
        subcategory: "utility",
        cashPrice: 0,
        mileage30Eligible: false,
        tags: [],
        status: "active",
        statusSource: "manual",
        components: [{ id: `${id}-component-1`, name: "", quantity: 1 }],
        excludedComponents: [],
        checkedAt: new Date().toISOString().slice(0, 10),
      }),
      isNew: true,
    });
  };

  const saveProduct = () => {
    if (!editor || !editor.name.trim() || editor.cashPrice <= 0) {
      setNotice("상품명과 캐시 가격을 확인해 주세요.");
      return;
    }
    requestSharedEdit(() => {
      const { isNew, priceBasis, componentPrices, saleLimit, note, updatedAt, ...productFields } = editor;
      const normalizedProduct: CatalogProduct = {
        ...productFields,
        name: productFields.name.trim(),
        subcategory: productFields.subcategory,
        tags: Array.from(new Set<ProductTag>([
          ...productFields.tags.filter((tag) => tag !== "mileage30"),
          ...(productFields.mileage30Eligible ? ["mileage30" as const] : []),
        ])),
        components: productFields.components.map((component) => ({
          ...component,
          name: component.name.trim() || productFields.name.trim(),
          quantity: Math.max(1, Math.floor(component.quantity)),
        })),
      };
      const normalizedPrice: ProductPriceData = { priceBasis, componentPrices, saleLimit, note, updatedAt: new Date().toISOString() };
      if (isNew) {
        setProducts((current) => [...current, normalizedProduct]);
        setPriceData((current) => ({ ...current, [normalizedProduct.id]: normalizeProductPrice(normalizedProduct, normalizedPrice) }));
        setNotice("새 상품을 추가했어요.");
      } else {
        setProducts((current) => current.map((product) => (product.id === editor.id ? normalizedProduct : product)));
        setPriceData((current) => ({ ...current, [editor.id]: normalizeProductPrice(normalizedProduct, normalizedPrice) }));
        setNotice("상품 정보를 저장했어요.");
      }
      markProductChanged(normalizedProduct.id);
      normalizedProduct.components.forEach((component) => markComponentChanged(component.id));
      setEditor(null);
    });
  };

  const addPlanItem = () => {
    const product = products.find((candidate) => isProductActive(candidate));
    if (!product) {
      setNotice("먼저 상품을 추가해 주세요.");
      return;
    }
    setPlan((current) => [
      ...current,
      { id: newPlanId(), productId: product.id, quantity: 1, useMileage: false },
    ]);
  };

  const updatePlanItem = (id: string, changes: Partial<PlanItem>) => {
    setPlan((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };

  const saveBackupFile = () => {
    const backup = createLocalBackup(settings, products, priceData, plan, goalCash);
    const payload = JSON.stringify(backup, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `maple-red-backup-${backupFileTimestamp()}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice("백업 파일을 저장했습니다.");
  };

  const selectBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const candidate = parseBackupCandidate(JSON.parse(await file.text()));
      setRestoreCandidate(candidate);
    } catch (error) {
      setNotice(error instanceof Error && error.message === "unsupported"
        ? "이 백업 파일은 현재 버전에서 복원할 수 없습니다."
        : "올바른 계산기 백업 파일이 아닙니다.");
    }
  };

  const confirmBackupRestore = () => {
    if (!restoreCandidate) return;
    const beforeRestore = createLocalBackup(settings, products, priceData, plan, goalCash);
    window.localStorage.setItem(BEFORE_RESTORE_BACKUP_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      backup: beforeRestore,
    }));

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    pendingCloudChangesRef.current = { settings: false, productIds: new Set(), componentIds: new Set() };
    pendingEditRef.current = null;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      settings: restoreCandidate.settings,
      products: restoreCandidate.products,
      priceData: restoreCandidate.priceData,
      plan: restoreCandidate.plan,
      goalCash: restoreCandidate.goalCash,
    }));

    settingsRef.current = restoreCandidate.settings;
    productsRef.current = restoreCandidate.products;
    priceDataRef.current = restoreCandidate.priceData;
    setSettings(restoreCandidate.settings);
    setProducts(restoreCandidate.products);
    setPriceData(restoreCandidate.priceData);
    setPlan(restoreCandidate.plan);
    setGoalCash(restoreCandidate.goalCash);
    setRestoreCandidate(null);

    if (cloudConfigured) {
      const nextMeta = { ...cloudMetaRef.current, pendingFullUpload: true };
      persistCloudMeta(nextMeta);
      setNeedsCloudMigration(true);
      setCloudStatus("migration");
      setRestoreSharePromptOpen(true);
    }
    setNotice("백업 데이터를 복원했습니다.");
  };

  const keepRestoredDataLocal = () => {
    setRestoreSharePromptOpen(false);
    setNotice("백업 데이터를 복원했습니다.");
  };

  const uploadRestoredData = () => {
    setRestoreCloudConfirmOpen(false);
    requestSharedEdit(() => { void uploadCurrentData("복원한 데이터를 공유 데이터에도 적용했습니다."); });
  };

  const availableSubcategories = categoryFilter === "all" ? [] : SUBCATEGORY_OPTIONS[categoryFilter];
  const statusFiltersAreClear = mileageFilter === "all" && !activeOnly && profitFilter === "all";
  const selectCategory = (category: CategoryFilter) => {
    setCategoryFilter(category);
    setSubcategoryFilter("all");
  };
  const clearStatusFilters = () => {
    setMileageFilter("all");
    setActiveOnly(false);
    setProfitFilter("all");
  };

  const bestCalculation = bestProduct ? calculate(bestProduct, getProductPrice(priceData, bestProduct), settings) : null;
  const bestVerdict = bestCalculation ? verdict(bestCalculation.gapPercent) : null;
  const cloudStatusText: Record<CloudStatus, string> = {
    local: "이 기기에 자동 저장",
    loading: "공유 데이터 확인 중...",
    synced: "공유 데이터 동기화됨",
    saving: "저장 중...",
    offline: "클라우드 연결 실패 · 이 기기에 저장됨",
    permission: "수정 권한 필요",
    migration: "기존 데이터 보호 중",
  };
  const editorAccessText = editorAccess === "unlocked" ? "수정 가능" : "조회 전용";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="레드작 손익 계산기 홈">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>레드작 손익 계산기</strong>
            <small>현금 지출부터 메소 회수까지</small>
          </span>
        </a>
        <nav aria-label="주요 영역">
          <a href="#products">상품 분석</a>
          <a href="#planner">전체 계산</a>
        </nav>
        <div className="top-actions">
          <span className={`save-state cloud-state cloud-${cloudStatus}`}><i aria-hidden="true" /> {cloudStatusText[cloudStatus]}{cloudConfigured && <small>{editorAccessText}</small>}</span>
        </div>
      </header>

      <section className="intro-grid" id="top">
        <div className="hero-copy">
          <span className="eyebrow">RED WORK ECONOMY TOOL</span>
          <h1>감이 아닌 숫자로<br />레드작을 결정하세요.</h1>
          <p className="lead">상품권 할인, 경매장 수수료, 마일리지까지 반영해 실제 1억 메소당 비용과 메소 직구 대비 차이를 계산합니다.</p>
          <div className="hero-notes">
            <span><i>1</i> 실제 결제액</span>
            <span><i>2</i> 수수료 후 회수액</span>
            <span><i>3</i> 직구 대비 손익</span>
          </div>
        </div>

        <div className="settings-card panel">
          <div className="section-heading">
            <div>
              <span className="step">01</span>
              <div>
                <p>기본 설정</p>
                <h2>계산 기준</h2>
              </div>
            </div>
            <span className="quiet">입력 즉시 반영</span>
          </div>
          <div className="input-grid">
            <NumberField label="현재 메소 현금 시세" value={settings.mesoPrice} suffix="원 / 1억" onChange={(value) => updateSettings("mesoPrice", value)} />
            <NumberField label="상품권 할인율" value={settings.giftDiscount} suffix="%" step={0.1} onChange={(value) => updateSettings("giftDiscount", Math.min(value, 100))} />
            <NumberField label="경매장 수수료" value={settings.auctionFee} suffix="%" step={0.1} onChange={(value) => updateSettings("auctionFee", Math.min(value, 100))} />
          </div>
          <div className="settings-options">
            <label className="select-field">
              <span>마일리지 가치</span>
              <select value={settings.mileageMode} onChange={(event) => updateSettings("mileageMode", event.target.value as Settings["mileageMode"])}>
                <option value="none">미반영</option>
                <option value="direct">1마일리지당 직접 입력</option>
              </select>
            </label>
            {settings.mileageMode === "direct" && (
              <NumberField label="1마일리지 가치" value={settings.mileageWon} suffix="원" step={0.01} onChange={(value) => updateSettings("mileageWon", value)} />
            )}
            <label className="switch-row">
              <span><b>캐시 구매 마일리지 적립</b><small>결제 대상 캐시의 5%를 가치에서 차감</small></span>
              <input type="checkbox" checked={settings.includeMileageEarned} onChange={(event) => updateSettings("includeMileageEarned", event.target.checked)} />
            </label>
            <label className="switch-row">
              <span><b>마일리지 30% 비교값 표시</b><small>상품 목록에 적용 전·후를 함께 표시</small></span>
              <input type="checkbox" checked={settings.showMileage} onChange={(event) => updateSettings("showMileage", event.target.checked)} />
            </label>
          </div>
          {cloudConfigured && (
            <div className="cloud-access-row">
              <span><i aria-hidden="true" /> {editorAccessText}</span>
              {editorAccess === "unlocked" && <button className="text-button release-access" type="button" onClick={() => { void releaseEditorAccess(); }}>이 기기의 수정 권한 해제</button>}
            </div>
          )}
          {cloudConfigured && needsCloudMigration && (
            <div className="cloud-migration-notice" role="status">
              <span><strong>이 기기의 기존 데이터를 공유 데이터로 사용할 수 있습니다.</strong><small>현재 localStorage 데이터는 유지되며, 업로드 전 별도 안전 백업도 만듭니다.</small></span>
              <button className="secondary-button" type="button" onClick={startCloudMigration}>현재 데이터로 공유 시작</button>
            </div>
          )}
          <div className="data-management-row">
            <span><strong>PC 백업 파일</strong><small>현재 계산 데이터를 JSON 파일로 안전하게 보관하거나 복원합니다.</small></span>
            <div>
              <button className="secondary-button" type="button" onClick={saveBackupFile}>백업 파일 저장</button>
              <button className="secondary-button" type="button" onClick={() => importRef.current?.click()}>백업 파일 복원</button>
              <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={selectBackupFile} />
            </div>
          </div>
        </div>
      </section>

      {bestProduct && bestCalculation && bestVerdict ? (
        <section className="best-card" aria-label="현재 가장 효율 좋은 상품">
          <div>
            <span className="eyebrow warm">현재 가장 효율적인 선택</span>
            <h2>{bestProduct.name}</h2>
            <p>{BASIS_LABEL[getProductPrice(priceData, bestProduct).priceBasis]} {formatEok(bestCalculation.salePrice)} · 수수료 적용 실수령 {formatEok(bestCalculation.netMeso)}</p>
          </div>
          <div className="metric">
            <span>1억당 실제 현금</span>
            <strong>{formatNumber(bestCalculation.primaryPerEok)}<small>원</small></strong>
            {settings.mileageMode === "direct" && <em>마일리지 가치 포함</em>}
          </div>
          <div className={`verdict ${bestVerdict.className}`}>
            <span>메소 직구 대비</span>
            <strong>{bestCalculation.gapPercent >= 0 ? "+" : ""}{formatNumber(bestCalculation.gapPercent, 1)}%</strong>
            <small>{bestVerdict.text}</small>
          </div>
          <button className="best-detail" type="button" onClick={() => setDetailId(bestProduct.id)}>계산 근거 보기 <span>→</span></button>
        </section>
      ) : (
        <section className="empty-best">상품 또는 패키지 구성품의 경매장 가격을 입력하면 가장 효율적인 선택을 보여드려요.</section>
      )}

      <section className="products-section" id="products">
        <div className="section-heading outside">
          <div>
            <span className="step">02</span>
            <div>
              <p>상품별 비교</p>
              <h2>상품 효율 순위</h2>
            </div>
          </div>
          <div className="heading-actions">
            <span className="lower-is-better"><i>↓</i> 1억당 현금은 낮을수록 유리</span>
            <button className="primary-button" type="button" onClick={openNewProduct}><span>＋</span> 상품 추가</button>
          </div>
        </div>

        <div className="product-filter-panel panel">
          <div className="filter-top-row">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품명·패키지·구성품 검색" aria-label="상품명, 패키지명 또는 구성품명 검색" />
            </label>
            <label className="sort-control">
              <span>정렬</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                <option value="base">미적용 효율</option>
                <option value="mileage">마일 적용 효율</option>
                <option value="cashAsc">캐시 가격 낮은 순</option>
                <option value="cashDesc">캐시 가격 높은 순</option>
                <option value="name">이름순</option>
              </select>
            </label>
          </div>
          <div className="filter-group">
            <span className="filter-label">상품 분류</span>
            <div className="filter-tabs category-tabs" role="group" aria-label="상품 1차 분류">
              {CATEGORY_FILTER_OPTIONS.map(([key, label]) => (
                <button key={key} className={categoryFilter === key ? "active" : ""} type="button" aria-pressed={categoryFilter === key} onClick={() => selectCategory(key)}>{label}</button>
              ))}
            </div>
          </div>
          {categoryFilter !== "all" && availableSubcategories.length > 1 && (
            <div className="filter-group subcategory-filter-group">
              <span className="filter-label">세부 분류</span>
              <div className="filter-tabs subcategory-tabs" role="group" aria-label="상품 2차 분류">
                <button className={subcategoryFilter === "all" ? "active" : ""} type="button" aria-pressed={subcategoryFilter === "all"} onClick={() => setSubcategoryFilter("all")}>전체</button>
                {availableSubcategories.map((key) => (
                  <button key={key} className={subcategoryFilter === key ? "active" : ""} type="button" aria-pressed={subcategoryFilter === key} onClick={() => setSubcategoryFilter(key)}>{SUBCATEGORY_LABELS[key]}</button>
                ))}
              </div>
            </div>
          )}
          <div className="filter-group">
            <span className="filter-label">상태·효율</span>
            <div className="filter-tabs status-filter-tabs" role="group" aria-label="상품 상태 및 효율 필터">
              <button className={statusFiltersAreClear ? "active" : ""} type="button" aria-pressed={statusFiltersAreClear} onClick={clearStatusFilters}>전체</button>
              <button className={mileageFilter === "eligible" ? "active" : ""} type="button" aria-pressed={mileageFilter === "eligible"} onClick={() => setMileageFilter((current) => current === "eligible" ? "all" : "eligible")}>마일30 가능</button>
              <button className={mileageFilter === "ineligible" ? "active" : ""} type="button" aria-pressed={mileageFilter === "ineligible"} onClick={() => setMileageFilter((current) => current === "ineligible" ? "all" : "ineligible")}>마일 사용 불가</button>
              <button className={activeOnly ? "active" : ""} type="button" aria-pressed={activeOnly} onClick={() => setActiveOnly((current) => !current)}>판매 가능</button>
              <button className={profitFilter === "good" ? "active" : ""} type="button" aria-pressed={profitFilter === "good"} onClick={() => setProfitFilter((current) => current === "good" ? "all" : "good")}>유리</button>
              <button className={profitFilter === "bad" ? "active" : ""} type="button" aria-pressed={profitFilter === "bad"} onClick={() => setProfitFilter((current) => current === "bad" ? "all" : "bad")}>불리</button>
            </div>
          </div>
        </div>

        <div className="table-panel panel desktop-product-table">
          <div className="table-scroll">
            <table className="product-table">
              <thead>
                <tr>
                  <th>순위 · 상품</th>
                  <th>분류</th>
                  <th>캐시 가격</th>
                  <th>판매 기준가</th>
                  <th>실수령 메소</th>
                  <th>효율</th>
                  <th>상태</th>
                  <th><span className="visually-hidden">관리</span></th>
                </tr>
              </thead>
              <tbody>
                {rankedProducts.map((product, index) => {
                  const productPrice = getProductPrice(priceData, product);
                  const base = calculate(product, productPrice, settings);
                  const hasPrice = base.salePrice > 0;
                  const isEnded = effectiveProductStatus(product) === "ended";
                  const state = hasPrice ? verdict(base.gapPercent) : { text: "가격 미입력", className: "neutral" };
                  const includedCount = totalQuantity(product);
                  const excludedCount = excludedQuantity(product);
                  const isExpanded = expandedProductId === product.id;
                  const panelId = `product-panel-${product.id}`;
                  return (
                    <Fragment key={product.id}>
                      <tr
                        className={`product-summary-row ${isExpanded ? "expanded" : ""}`}
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        onClick={() => toggleProduct(product.id)}
                        onKeyDown={(event) => toggleProductWithKeyboard(event, product.id)}
                      >
                        <td>
                          <div className="product-cell">
                            <span className="rank">{!isEnded && hasPrice ? String(index + 1).padStart(2, "0") : "—"}</span>
                            <div>
                              <span className="product-name-line"><strong className="product-name">{product.name}</strong><ProductStatusBadge product={product} /></span>
                              {(includedCount > 1 || excludedCount > 0) && <span className="product-meta">구성 {includedCount + excludedCount}개</span>}
                            </div>
                          </div>
                        </td>
                        <td><CategoryBadges product={product} /></td>
                        <td><strong>{formatNumber(product.cashPrice)}</strong><small>캐시</small></td>
                        <td><strong>{formatOptionalEok(base.salePrice)}</strong><small>{BASIS_LABEL[productPrice.priceBasis]}</small></td>
                        <td><strong>{formatOptionalEok(base.netMeso)}</strong><small>수수료 {formatNumber(settings.auctionFee, 1)}%</small></td>
                        <td className="efficiency-cell">
                          <strong>{formatWon(base.primaryPerEok)}</strong>
                          <span className={`result-chip ${state.className}`}>{state.text}</span>
                        </td>
                        <td className="summary-status-cell">
                          {product.mileage30Eligible ? <span className="yes-chip">마일30 가능</span> : <span className="no-chip">사용 불가</span>}
                        </td>
                        <td>
                          <button
                            className="accordion-toggle"
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            aria-label={`${product.name} ${isExpanded ? "접기" : "펼치기"}`}
                            onClick={(event) => { event.stopPropagation(); toggleProduct(product.id); }}
                          ><span className="chevron" aria-hidden="true">⌄</span></button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="product-detail-row">
                          <td colSpan={8}>
                            <div className="product-accordion-panel" id={panelId}>
                              <ProductAccordionDetails
                                product={product}
                                priceData={productPrice}
                                settings={settings}
                                onPriceBasisChange={(priceBasis) => updateProductPrice(product.id, { priceBasis })}
                                onComponentPriceChange={(componentId, key, value) => updateComponentMarketPrice(product.id, componentId, key, value)}
                                onProductChange={(changes) => updateProduct(product.id, changes)}
                                onDetail={() => setDetailId(product.id)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="product-card-list">
          {rankedProducts.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priceData={getProductPrice(priceData, product)}
              settings={settings}
              rank={index + 1}
              expanded={expandedProductId === product.id}
              onToggle={() => toggleProduct(product.id)}
              onDetail={() => setDetailId(product.id)}
              onPriceBasisChange={(priceBasis) => updateProductPrice(product.id, { priceBasis })}
              onComponentPriceChange={(componentId, key, value) => updateComponentMarketPrice(product.id, componentId, key, value)}
              onProductChange={(changes) => updateProduct(product.id, changes)}
            />
          ))}
        </div>
        {rankedProducts.length === 0 && (
          <div className="empty-state panel"><span>⌕</span><h3>조건에 맞는 상품이 없어요.</h3><p>검색어 또는 필터를 바꿔 보세요.</p></div>
        )}
        <div className="product-list-footnote panel"><span>2026-08-23 판매 스냅샷 · 경매장 가격은 사용자 입력값만 사용합니다.</span><span>{formatNumber(rankedProducts.length)} / {formatNumber(INITIAL_DATA_COUNTS.currentProducts)}개 표시 중</span></div>
      </section>

      <section className="planner-section" id="planner">
        <div className="section-heading outside light-heading">
          <div>
            <span className="step light">03</span>
            <div>
              <p>목표 시뮬레이션</p>
              <h2>레드작 전체 계산기</h2>
            </div>
          </div>
          <p className="planner-intro">여러 상품과 수량을 조합해 목표 캐시 구매액의 전체 손익을 확인하세요.</p>
        </div>

        <div className="planner-layout">
          <div className="plan-builder">
            <div className="goal-field">
              <div>
                <label htmlFor="goal-cash">목표 구매액</label>
                <p>레드 등급 달성에 필요한 총 캐시</p>
              </div>
              <span className="goal-input"><input id="goal-cash" type="number" min="0" value={goalCash} onChange={(event) => setGoalCash(safeNumber(event.target.value))} /><b>캐시</b></span>
            </div>
            <div className="progress-track"><span style={{ width: `${goalProgress}%` }} /></div>
            <div className="progress-copy"><span>{formatNumber(planTotals.cashPurchased)}캐시 구성</span><span>{formatNumber(goalProgress, 1)}%</span></div>

            <div className="plan-list">
              <div className="plan-list-head"><span>사용 상품 구성</span><span>상품별 판매 한도를 적용해 주세요.</span></div>
              {plan.map((item, index) => {
                const product = products.find((candidate) => candidate.id === item.productId);
                const productPrice = product ? getProductPrice(priceData, product) : null;
                const overLimit = !!(productPrice?.saleLimit && item.quantity > productPrice.saleLimit);
                return (
                  <div className={`plan-row ${overLimit ? "over-limit" : ""}`} key={item.id}>
                    <span className="plan-number">{index + 1}</span>
                    <label>
                      <span className="visually-hidden">상품 선택</span>
                      <select value={item.productId} onChange={(event) => updatePlanItem(item.id, { productId: event.target.value, useMileage: false })}>
                        {products.filter((candidate) => isProductActive(candidate)).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
                      </select>
                      {product && <small>{formatNumber(product.cashPrice)}캐시 · {productPrice?.saleLimit ? `한도 ${formatNumber(productPrice.saleLimit)}개` : "한도 미설정"}</small>}
                    </label>
                    <label className="quantity-control">
                      <span>수량</span>
                      <input type="number" min="0" value={item.quantity} onChange={(event) => updatePlanItem(item.id, { quantity: Math.floor(safeNumber(event.target.value)) })} />
                    </label>
                    <label className={`mini-check ${!product?.mileage30Eligible ? "disabled" : ""}`}>
                      <input type="checkbox" disabled={!product?.mileage30Eligible} checked={item.useMileage && !!product?.mileage30Eligible} onChange={(event) => updatePlanItem(item.id, { useMileage: event.target.checked })} />
                      <span>마일30</span>
                    </label>
                    <button className="remove-button" type="button" aria-label={`${index + 1}번째 구성 삭제`} onClick={() => setPlan((current) => current.filter((candidate) => candidate.id !== item.id))}>×</button>
                    {overLimit && <span className="limit-warning">설정한 판매 한도 {formatNumber(productPrice?.saleLimit ?? 0)}개를 초과했어요.</span>}
                  </div>
                );
              })}
              {plan.length === 0 && <div className="empty-plan">상품 구성을 추가해 전체 결과를 계산해 보세요.</div>}
            </div>
            <button className="add-row-button" type="button" onClick={addPlanItem}>＋ 상품 구성 추가</button>
          </div>

          <aside className="plan-summary">
            <span className="eyebrow warm">TOTAL ESTIMATE</span>
            <h3>전체 예상 결과</h3>
            <div className="summary-hero">
              <span>메소 직구 대비 총 차이</span>
              <strong className={planDifference >= 0 ? "positive" : "negative"}>{planDifference >= 0 ? "+" : ""}{formatWon(planDifference)}</strong>
              <small className={planDifference >= 0 ? "positive" : "negative"}>{planPercent >= 0 ? "+" : ""}{formatNumber(planPercent, 1)}% {planDifference >= 0 ? "유리" : "불리"}</small>
            </div>
            <dl>
              <div><dt>총 캐시 구매액</dt><dd>{formatNumber(planTotals.cashPurchased)}캐시</dd></div>
              <div><dt>실제 상품권 구매 비용</dt><dd>{formatWon(planTotals.actualCash)}</dd></div>
              {settings.mileageMode === "direct" && <div><dt>마일리지 포함 경제적 비용</dt><dd>{formatWon(planTotals.economicCost)}</dd></div>}
              <div><dt>총 사용 마일리지</dt><dd>{formatNumber(planTotals.mileageUsed)}마일</dd></div>
              {settings.includeMileageEarned && <div><dt>예상 적립 마일리지</dt><dd>{formatNumber(planTotals.earnedMileage)}마일</dd></div>}
              <div><dt>총 회수 메소</dt><dd>{formatEok(planTotals.netMeso)} 메소</dd></div>
              <div><dt>현재 시세 기준 회수 가치</dt><dd>{formatWon(planMarketValue)}</dd></div>
            </dl>
            <div className="remaining-box">
              <span>목표까지 남은 금액</span>
              <strong>{formatNumber(remainingGoal)}캐시</strong>
              {remainingGoal === 0 && <small>목표 구매액을 채웠어요.</small>}
            </div>
            <p className="summary-note">판매 가격과 수수료가 유지된다는 가정의 예상치입니다.</p>
          </aside>
        </div>
      </section>

      <footer>
        <div className="brand-mark small" aria-hidden="true">R</div>
        <p><strong>레드작 손익 계산기</strong><span>개인 입력 데이터를 바탕으로 한 참고용 계산 도구입니다.</span></p>
        <small>비공식 MapleStory 유틸리티이며 NEXON과 무관합니다.</small>
      </footer>

      {detailProduct && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDetailId(null)}>
          <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="상세 닫기" onClick={() => setDetailId(null)}>×</button>
            <ProductDetail product={detailProduct} priceData={getProductPrice(priceData, detailProduct)} settings={settings} onEdit={() => { setEditor({ ...detailProduct, ...getProductPrice(priceData, detailProduct) }); setDetailId(null); }} />
          </section>
        </div>
      )}

      {editor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditor(null)}>
          <section className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="편집 닫기" onClick={() => setEditor(null)}>×</button>
            <span className="eyebrow">PRODUCT DATA</span>
            <h2 id="editor-title">{editor.isNew ? "새 상품 추가" : "상품 정보 수정"}</h2>
            <p className="modal-lead">상품 정보와 판매 설정을 수정합니다. 변경 내용은 이 기기에 자동 저장됩니다.</p>
            <div className="editor-grid">
              <label className="full"><span>상품명</span><input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="예: 플래티넘 카르마의 가위" autoFocus /></label>
              <label><span>카테고리</span><select value={editor.category} onChange={(event) => { const category = event.target.value as ProductCategory; setEditor({ ...editor, category, subcategory: SUBCATEGORY_OPTIONS[category][0] }); }}>{(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span>세부 분류</span><select value={editor.subcategory ?? ""} onChange={(event) => setEditor({ ...editor, subcategory: event.target.value ? event.target.value as ProductSubcategory : undefined })}>{editor.category === "coupon" && <option value="">없음</option>}{SUBCATEGORY_OPTIONS[editor.category].map((key) => <option key={key} value={key}>{SUBCATEGORY_LABELS[key]}</option>)}</select></label>
              <label><span>캐시 가격</span><span className="affix-input"><input type="number" min="0" value={editor.cashPrice} onChange={(event) => setEditor({ ...editor, cashPrice: safeNumber(event.target.value) })} /><small>캐시</small></span></label>
              <label><span>판매 스냅샷 확인일</span><input type="date" value={editor.checkedAt} onChange={(event) => setEditor({ ...editor, checkedAt: event.target.value })} /></label>
              <label><span>계산 가격 기준</span><select value={editor.priceBasis} onChange={(event) => setEditor({ ...editor, priceBasis: event.target.value as PriceBasis })}><option value="current">현재 최저가</option><option value="recent">최근 체결가</option></select></label>
              <label><span>예상 판매 가능 수량</span><span className="affix-input"><input type="number" min="0" value={editor.saleLimit ?? ""} placeholder="미설정" onChange={(event) => setEditor({ ...editor, saleLimit: optionalNumber(event.target.value) })} /><small>개</small></span></label>
              <label><span>마지막 가격 확인</span><input type="datetime-local" value={editor.updatedAt.slice(0, 16)} onChange={(event) => setEditor({ ...editor, updatedAt: event.target.value })} /></label>
              <label className="editor-check"><input type="checkbox" checked={editor.mileage30Eligible} onChange={(event) => setEditor({ ...editor, mileage30Eligible: event.target.checked })} /><span><b>마일리지 30% 사용 가능</b><small>미적용·적용 효율을 함께 계산합니다.</small></span></label>
              <label><span>판매 상태</span><select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as ProductStatus, statusSource: "manual" })}>{PRODUCT_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>상태 적용 방식</span><select value={editor.statusSource} onChange={(event) => setEditor({ ...editor, statusSource: event.target.value as ProductStatusSource })}><option value="manual">직접 지정</option><option value="automatic">판매 기간으로 자동</option></select></label>
              <label><span>판매 시작일</span><input type="date" value={editor.saleStartAt ?? ""} onChange={(event) => setEditor({ ...editor, saleStartAt: event.target.value || undefined })} /></label>
              <label><span>판매 종료일</span><input type="date" value={editor.saleEndAt ?? ""} onChange={(event) => setEditor({ ...editor, saleEndAt: event.target.value || undefined })} /></label>
              <label className="full"><span>메모</span><textarea value={editor.note} onChange={(event) => setEditor({ ...editor, note: event.target.value })} placeholder="판매 속도, 시세 특이사항 등을 기록하세요." /></label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setEditor(null)}>취소</button>
              <button className="primary-button" type="button" onClick={saveProduct}>저장하기</button>
            </div>
          </section>
        </div>
      )}

      {restoreCandidate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRestoreCandidate(null)}>
          <section className="modal restore-modal" role="dialog" aria-modal="true" aria-labelledby="restore-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="백업 복원 확인 닫기" onClick={() => setRestoreCandidate(null)}>×</button>
            <span className="eyebrow">LOCAL BACKUP</span>
            <h2 id="restore-confirm-title">이 백업으로 현재 데이터를 복원하시겠습니까?</h2>
            <p className="modal-lead">복원 직전의 현재 상태는 이 기기의 별도 안전 백업에 먼저 보관됩니다.</p>
            <dl className="restore-summary">
              <div><dt>백업 생성일</dt><dd>{restoreCandidate.exportedAt ? formatDate(restoreCandidate.exportedAt) : "미확인"}</dd></div>
              <div><dt>포함 상품</dt><dd>{formatNumber(restoreCandidate.productCount)}개</dd></div>
              <div><dt>포함 구성품</dt><dd>{formatNumber(restoreCandidate.componentCount)}개</dd></div>
            </dl>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setRestoreCandidate(null)}>취소</button>
              <button className="primary-button" type="button" onClick={confirmBackupRestore}>복원</button>
            </div>
          </section>
        </div>
      )}

      {restoreSharePromptOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={keepRestoredDataLocal}>
          <section className="modal restore-modal" role="dialog" aria-modal="true" aria-labelledby="restore-complete-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="복원 완료 안내 닫기" onClick={keepRestoredDataLocal}>×</button>
            <span className="eyebrow">RESTORE COMPLETE</span>
            <h2 id="restore-complete-title">복원이 완료되었습니다.</h2>
            <p className="modal-lead">현재 기기의 화면과 localStorage에만 반영되었습니다. 공유 데이터는 아직 변경하지 않았습니다.</p>
            <div className="modal-actions restore-choice-actions">
              <button className="secondary-button" type="button" onClick={keepRestoredDataLocal}>이 기기에서만 사용</button>
              <button className="primary-button" type="button" onClick={() => { setRestoreSharePromptOpen(false); setRestoreCloudConfirmOpen(true); }}>공유 데이터에도 적용</button>
            </div>
          </section>
        </div>
      )}

      {restoreCloudConfirmOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRestoreCloudConfirmOpen(false)}>
          <section className="modal restore-modal" role="alertdialog" aria-modal="true" aria-labelledby="restore-cloud-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="공유 데이터 업데이트 확인 닫기" onClick={() => setRestoreCloudConfirmOpen(false)}>×</button>
            <span className="eyebrow">SHARED DATA</span>
            <h2 id="restore-cloud-title">공유 데이터도 업데이트할까요?</h2>
            <p className="modal-lead">현재 복원된 데이터를 다른 기기에서 사용하는 공유 데이터에도 적용합니다.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setRestoreCloudConfirmOpen(false)}>취소</button>
              <button className="primary-button" type="button" onClick={uploadRestoredData}>공유 데이터 업데이트</button>
            </div>
          </section>
        </div>
      )}

      {pinModalOpen && (
        <div className="modal-backdrop pin-backdrop" role="presentation" onMouseDown={cancelPin}>
          <form className="modal pin-modal" role="dialog" aria-modal="true" aria-labelledby="pin-title" onSubmit={handlePinSubmit} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="수정 권한 확인 닫기" onClick={cancelPin}>×</button>
            <span className="eyebrow">EDITOR ACCESS</span>
            <h2 id="pin-title">수정 권한 확인</h2>
            <p className="modal-lead">이 기기에서 처음 수정할 때만 확인합니다. PIN 원문은 저장되지 않습니다.</p>
            <label className="pin-field">
              <span>관리자 PIN</span>
              <input ref={pinInputRef} type="password" inputMode="numeric" autoComplete="one-time-code" value={pinValue} onChange={(event) => setPinValue(event.target.value)} />
            </label>
            {pinError && <p className="pin-error" role="alert">{pinError}</p>}
            <div className="modal-actions pin-actions">
              <button className="secondary-button" type="button" onClick={cancelPin}>취소</button>
              {cloudStatus === "offline" && <button className="secondary-button" type="button" onClick={continueLocalOnly}>이 기기에만 수정</button>}
              <button className="primary-button" type="submit" disabled={pinSubmitting || !pinValue.trim()}>{pinSubmitting ? "확인 중..." : "수정 활성화"}</button>
            </div>
          </form>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function ProductCard({
  product,
  priceData,
  settings,
  rank,
  expanded,
  onToggle,
  onDetail,
  onPriceBasisChange,
  onComponentPriceChange,
  onProductChange,
}: {
  product: CatalogProduct;
  priceData: ProductPriceData;
  settings: Settings;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  onDetail: () => void;
  onPriceBasisChange: (basis: PriceBasis) => void;
  onComponentPriceChange: (componentId: string, key: keyof ComponentMarketPrice, value: number | null) => void;
  onProductChange: (changes: Partial<CatalogProduct>) => void;
}) {
  const base = calculate(product, priceData, settings);
  const hasPrice = base.salePrice > 0;
  const mileage = settings.showMileage && product.mileage30Eligible && hasPrice
    ? calculate(product, priceData, settings, true)
    : null;
  const isEnded = effectiveProductStatus(product) === "ended";
  const state = hasPrice ? verdict(base.gapPercent) : { text: "가격 미입력", className: "neutral" };
  const mileageState = mileage ? verdict(mileage.gapPercent) : null;
  const includedCount = totalQuantity(product);
  const excludedCount = excludedQuantity(product);
  const panelId = `product-card-panel-${product.id}`;

  return (
    <article className={`product-card product-accordion-card panel ${expanded ? "expanded" : "collapsed"} ${isEnded ? "ended" : ""}`}>
      <button className={`product-card-toggle${settings.showMileage ? " with-mileage" : ""}`} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
        <span className="card-rank">{!isEnded && hasPrice ? String(rank).padStart(2, "0") : "—"}</span>
        <span className="card-product-main">
          <span className="card-product-name"><strong>{product.name}</strong></span>
          <span className="card-product-tags">
            <CategoryBadges product={product} />
            <ProductStatusBadge product={product} />
            {product.mileage30Eligible ? <span className="yes-chip">마일30 가능</span> : <span className="no-chip">마일 불가</span>}
            {(includedCount > 1 || excludedCount > 0) && <span className="package-count">구성 {includedCount + excludedCount}개</span>}
          </span>
        </span>
        <span className="card-row-metric card-cash-price">
          <small>캐시</small>
          <strong>{formatNumber(product.cashPrice)}캐시</strong>
        </span>
        <span className="card-row-metric card-sale-price">
          <small>판매 기준가</small>
          <strong>{formatOptionalEok(base.salePrice)}</strong>
        </span>
        <span className="card-row-metric card-net-meso">
          <small>실수령</small>
          <strong>{formatOptionalEok(base.netMeso)}</strong>
        </span>
        <span className="card-primary-efficiency">
          <small>1억당 현금</small>
          <span className="card-efficiency-value">
            <strong>{formatWon(base.primaryPerEok)}</strong>
            <em className={state.className}>{hasPrice ? `${base.gapPercent >= 0 ? "+" : ""}${formatNumber(base.gapPercent, 1)}% ${state.text}` : state.text}</em>
          </span>
        </span>
        {settings.showMileage && (
          <span className="card-mileage-efficiency">
            <small>마일30 적용</small>
            {mileage && mileageState ? (
              <span className="card-mileage-value" aria-label={`마일리지 30% 적용 ${formatWon(mileage.primaryPerEok)}, ${formatNumber(mileage.mileageUsed)}마일, 직구 대비 ${mileage.gapPercent >= 0 ? "+" : ""}${formatNumber(mileage.gapPercent, 1)}% ${mileageState.text}`}>
                <strong>{formatWon(mileage.primaryPerEok)}</strong>
                <em className={mileageState.className}>{mileage.gapPercent >= 0 ? "+" : ""}{formatNumber(mileage.gapPercent, 1)}% {mileageState.text}</em>
                <small>{formatNumber(mileage.mileageUsed)}마일</small>
              </span>
            ) : <strong className="card-mileage-empty">—</strong>}
          </span>
        )}
        <span className="chevron" aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <div className="product-accordion-panel mobile-accordion-panel" id={panelId}>
          <ProductAccordionDetails
            product={product}
            priceData={priceData}
            settings={settings}
            onPriceBasisChange={onPriceBasisChange}
            onComponentPriceChange={onComponentPriceChange}
            onProductChange={onProductChange}
            onDetail={onDetail}
          />
        </div>
      )}
    </article>
  );
}

function ProductAccordionDetails({
  product,
  priceData,
  settings,
  onPriceBasisChange,
  onComponentPriceChange,
  onProductChange,
  onDetail,
}: {
  product: CatalogProduct;
  priceData: ProductPriceData;
  settings: Settings;
  onPriceBasisChange: (basis: PriceBasis) => void;
  onComponentPriceChange: (componentId: string, key: keyof ComponentMarketPrice, value: number | null) => void;
  onProductChange: (changes: Partial<CatalogProduct>) => void;
  onDetail: () => void;
}) {
  const mileage = product.mileage30Eligible ? calculate(product, priceData, settings, true) : null;
  const includedCount = totalQuantity(product);
  const excludedCount = excludedQuantity(product);
  const hasComponentSummary = includedCount > 1 || excludedCount > 0;
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [showSaleEditor, setShowSaleEditor] = useState(false);
  const priceEditorId = useId();
  const saleEditorId = useId();

  return (
    <div className="accordion-detail-content">
      <div className="accordion-detail-topline">
        <div>
          <strong>상품 상세</strong>
          <span>전체 {includedCount + excludedCount}개 · 합산 {includedCount}개{excludedCount > 0 ? ` · 계산 제외 ${excludedCount}개` : ""}</span>
        </div>
        <label className="accordion-basis-select">
          <span>판매 가격 기준</span>
          <select value={priceData.priceBasis} onChange={(event) => onPriceBasisChange(event.target.value as PriceBasis)}>
            <option value="current">현재 최저가</option>
            <option value="recent">최근 체결가</option>
          </select>
        </label>
      </div>

      {hasComponentSummary && (
        <section className="component-price-summary" aria-label={`${product.name} 구성품 가격 요약`}>
          <div className="component-price-summary-heading">
            <strong>구성품 가격</strong>
            <small>{BASIS_LABEL[priceData.priceBasis]} 기준</small>
          </div>
          <div className="component-price-summary-grid">
            {product.components.map((component) => {
              const componentPrice = priceData.componentPrices[component.id] ?? emptyComponentMarketPrice();
              const selectedComponentPrice = componentPriceForBasis(componentPrice, priceData.priceBasis) * component.quantity;
              return (
                <div className="component-price-summary-item" key={component.id}>
                  <span>{component.name}{component.quantity > 1 ? ` × ${component.quantity}` : ""}</span>
                  <strong>{formatOptionalEok(selectedComponentPrice)}</strong>
                </div>
              );
            })}
          </div>
          {excludedCount > 0 && (
            <div className="component-summary-excluded">
              <strong>계산 제외</strong>
              <ul>{product.excludedComponents.map((component) => <li key={component.id}>{component.name}{component.quantity > 1 ? ` × ${component.quantity}` : ""}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <div className="accordion-meta-actions">
        <div className="accordion-meta">
          <span>판매 스냅샷 {product.checkedAt}</span>
          <span>마지막 가격 확인 {formatDate(priceData.updatedAt)}</span>
          <span>판매 한도 {priceData.saleLimit ? `${formatNumber(priceData.saleLimit)}개` : "미설정"}</span>
          {settings.showMileage && mileage && <span>마일30 {formatWon(mileage.primaryPerEok)} · {formatNumber(mileage.mileageUsed)} 마일 필요</span>}
          {priceData.note && <span>메모 · {priceData.note}</span>}
        </div>
        <div className="accordion-actions">
          <button className="secondary-button" type="button" onClick={onDetail}>상세 계산 보기</button>
          <button className="primary-button" type="button" aria-expanded={showPriceEditor} aria-controls={priceEditorId} onClick={() => setShowPriceEditor((current) => !current)}>{showPriceEditor ? "상품가격 편집 닫기" : "상품가격 전체 편집"}</button>
          <button className="secondary-button" type="button" aria-expanded={showSaleEditor} aria-controls={saleEditorId} onClick={() => setShowSaleEditor((current) => !current)}>{showSaleEditor ? "판매 상태 닫기" : "판매 상태 편집"}</button>
        </div>
      </div>

      {showPriceEditor && (
        <section className="accordion-price-editor" id={priceEditorId} aria-label={`${product.name} 구성품별 가격 입력`}>
          <div className="accordion-price-heading">
            <div><strong>구성품별 경매장 가격</strong><small>현재 최저가와 최근 체결가를 억 메소 단위로 입력합니다.</small></div>
            <span>선택 기준 · {BASIS_LABEL[priceData.priceBasis]}</span>
          </div>
          <div className="component-price-grid">
            {product.components.map((component) => {
              const componentPrice = priceData.componentPrices[component.id] ?? emptyComponentMarketPrice();
              const selectedComponentPrice = componentPriceForBasis(componentPrice, priceData.priceBasis) * component.quantity;
              return (
                <div className="component-price-card" key={component.id}>
                  <div className="accordion-component-name">
                    <strong>{component.name}{component.quantity > 1 ? ` × ${component.quantity}` : ""}</strong>
                    <small>· 기준 {formatOptionalEok(selectedComponentPrice)}</small>
                  </div>
                  <div className="accordion-component-inputs">
                    <label><span>현재 최저가</span><span className="affix-input"><input type="number" min="0" step="0.01" value={componentPrice.currentMarketPrice ?? ""} placeholder="—" aria-label={`${component.name} 현재 최저가`} onChange={(event) => onComponentPriceChange(component.id, "currentMarketPrice", optionalNumber(event.target.value))} /><small>억</small></span></label>
                    <label><span>최근 체결가</span><span className="affix-input"><input type="number" min="0" step="0.01" value={componentPrice.recentTradePrice ?? ""} placeholder="—" aria-label={`${component.name} 최근 체결가`} onChange={(event) => onComponentPriceChange(component.id, "recentTradePrice", optionalNumber(event.target.value))} /><small>억</small></span></label>
                  </div>
                </div>
              );
            })}
          </div>
          {excludedCount > 0 && <div className="excluded-components"><strong>계산 제외 구성품</strong><span>{product.excludedComponents.map((component) => `${component.name}${component.quantity > 1 ? ` × ${component.quantity}` : ""}`).join(" · ")}</span></div>}
        </section>
      )}

      {showSaleEditor && (
        <section className="accordion-sale-editor" id={saleEditorId} aria-label={`${product.name} 판매 상태 편집`}>
          <div className="accordion-sale-heading"><strong>판매 상태 편집</strong></div>
          <div className="accordion-sale-grid">
            <label>
              <span>판매 상태</span>
              <select value={product.status} onChange={(event) => onProductChange({ status: event.target.value as ProductStatus, statusSource: "manual" })}>
                {PRODUCT_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>상태 적용 방식</span>
              <select value={product.statusSource} onChange={(event) => onProductChange({ statusSource: event.target.value as ProductStatusSource })}>
                <option value="manual">직접 지정</option>
                <option value="automatic">판매 기간으로 자동</option>
              </select>
            </label>
            <label>
              <span>판매 시작일</span>
              <input type="date" value={product.saleStartAt ?? ""} max={product.saleEndAt} onChange={(event) => onProductChange({ saleStartAt: event.target.value || undefined })} />
            </label>
            <label>
              <span>판매 종료일</span>
              <input type="date" value={product.saleEndAt ?? ""} min={product.saleStartAt} onChange={(event) => onProductChange({ saleEndAt: event.target.value || undefined })} />
            </label>
          </div>
        </section>
      )}
    </div>
  );
}

function ProductDetail({ product, priceData, settings, onEdit }: { product: CatalogProduct; priceData: ProductPriceData; settings: Settings; onEdit: () => void }) {
  const base = calculate(product, priceData, settings);
  const mileage = product.mileage30Eligible ? calculate(product, priceData, settings, true) : null;
  const hasPrice = base.salePrice > 0;
  const baseVerdict = hasPrice ? verdict(base.gapPercent) : { text: "가격 미입력", className: "neutral" };
  const priceDivergence = divergence(product, priceData);
  const includedCount = totalQuantity(product);
  const excludedCount = excludedQuantity(product);

  return (
    <>
      <span className="eyebrow">CALCULATION DETAIL</span>
      <div className="detail-title-row">
        <div><h2 id="detail-title">{product.name}</h2><p><CategoryBadges product={product} /> <span>· 확인 {product.checkedAt}</span></p></div>
        <button className="secondary-button" type="button" onClick={onEdit}>상품 정보 수정</button>
      </div>
      {Math.abs(priceDivergence) >= 50 && (
        <div className="price-warning"><strong>가격 차이를 확인해 주세요.</strong><span>현재 매물과 최근 체결가의 괴리율이 {priceDivergence >= 0 ? "+" : ""}{formatNumber(priceDivergence)}%입니다. 자동으로 가격 기준을 바꾸지 않았습니다.</span></div>
      )}
      <div className="detail-result">
        <div><span>미적용 1억당 비용</span><strong>{formatWon(base.primaryPerEok)}</strong><small>{hasPrice ? <>직구 대비 {base.gapPercent >= 0 ? "+" : ""}{formatNumber(base.gapPercent, 1)}%</> : "구성품 시세를 입력해 주세요"}</small></div>
        <div><span>판정</span><strong className={baseVerdict.className}>{baseVerdict.text}</strong><small>{hasPrice ? <>{base.gapWon >= 0 ? "+" : ""}{formatWon(base.gapWon)} / 1억</> : "계산 대기"}</small></div>
        {mileage && <div className="mileage-highlight"><span>마일30 적용</span><strong>{formatWon(mileage.primaryPerEok)}</strong><small>{formatNumber(mileage.mileageUsed)} 마일리지 사용</small></div>}
      </div>
      <div className="formula-grid">
        <FormulaBlock title="A. 마일리지 미적용" calculation={base} product={product} priceData={priceData} settings={settings} />
        {mileage && <FormulaBlock title="B. 마일리지 30% 적용" calculation={mileage} product={product} priceData={priceData} settings={settings} mileage />}
      </div>
      <section className="component-detail">
        <div className="component-detail-heading"><strong>패키지 구성</strong><span>전체 {includedCount + excludedCount}개 · 합산 {includedCount}개{excludedCount > 0 ? ` · 계산 제외 ${excludedCount}개` : ""}</span></div>
        <ul>{product.components.map((component) => <li key={component.id}><span>{component.name}{component.quantity > 1 ? ` × ${component.quantity}` : ""}</span><b>{formatOptionalEok(componentPriceForBasis(priceData.componentPrices[component.id] ?? emptyComponentMarketPrice(), priceData.priceBasis) * component.quantity)}</b></li>)}</ul>
        {excludedCount > 0 && <div className="excluded-components"><strong>계산 제외</strong><span>{product.excludedComponents.map((component) => `${component.name}${component.quantity > 1 ? ` × ${component.quantity}` : ""}`).join(" · ")}</span></div>}
      </section>
      {priceData.note && <div className="detail-note"><span>메모</span><p>{priceData.note}</p></div>}
    </>
  );
}

function FormulaBlock({
  title,
  calculation,
  product,
  priceData,
  settings,
  mileage = false,
}: {
  title: string;
  calculation: ReturnType<typeof calculate>;
  product: CatalogProduct;
  priceData: ProductPriceData;
  settings: Settings;
  mileage?: boolean;
}) {
  return (
    <section className="formula-block">
      <h3>{title}</h3>
      <dl>
        <div><dt>캐시 정가</dt><dd>{formatNumber(product.cashPrice)}캐시</dd></div>
        {mileage && <div><dt>현금 결제 대상</dt><dd>{formatNumber(calculation.cashFace)}캐시 <small>정가 × 70%</small></dd></div>}
        <div><dt>상품권 할인 후 현금</dt><dd>{formatWon(calculation.actualCash)} <small>{formatNumber(calculation.cashFace)} × (1 - {formatNumber(settings.giftDiscount, 1)}%)</small></dd></div>
        {mileage && <div><dt>사용 마일리지</dt><dd>{formatNumber(calculation.mileageUsed)}마일 <small>정가 × 30%</small></dd></div>}
        {settings.mileageMode === "direct" && mileage && <div><dt>마일리지 가치</dt><dd>{formatWon(calculation.mileageValue)} <small>{formatNumber(calculation.mileageUsed)} × {formatNumber(settings.mileageWon, 2)}원</small></dd></div>}
        {settings.includeMileageEarned && <div><dt>예상 적립 마일리지</dt><dd>{formatNumber(calculation.earnedMileage)}마일 <small>결제 대상 캐시 × 5%</small></dd></div>}
        <div><dt>판매 기준가</dt><dd>{formatOptionalEok(calculation.salePrice)} <small>{BASIS_LABEL[priceData.priceBasis]} · 구성품 합산</small></dd></div>
        <div><dt>경매장 수수료</dt><dd>{calculation.salePrice > 0 ? `-${formatEok(calculation.salePrice - calculation.netMeso)}` : "—"} <small>{formatNumber(settings.auctionFee, 1)}%</small></dd></div>
        <div><dt>실수령 메소</dt><dd>{formatOptionalEok(calculation.netMeso)} <small>판매가 × (1 - 수수료)</small></dd></div>
        <div className="formula-total"><dt>{settings.mileageMode === "direct" ? "경제적 총비용" : "실제 현금 지출"}</dt><dd>{formatWon(calculation.economicCost)}</dd></div>
        <div className="formula-final"><dt>1억당 현금</dt><dd>{formatWon(calculation.primaryPerEok)} <small>총비용 ÷ 실수령 억 메소</small></dd></div>
      </dl>
    </section>
  );
}
