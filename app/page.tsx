"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CURRENT_PRODUCTS,
  INITIAL_DATA_COUNTS,
  MILEAGE_REFERENCES,
  type CatalogProduct,
} from "./product-data";

type PriceBasis = "current" | "recent" | "direct";
type FilterKey = "all" | "mileage" | "noMileage" | "sellable" | "good" | "bad";
type SortKey = "base" | "mileage" | "cash" | "price" | "comparison" | "updated";

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
  manuallyConfirmedPrice: number | null;
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

const STORAGE_KEY = "red-work-profit-calculator-v1";
const STORAGE_VERSION = 2;
const MILEAGE_RATE = 0.05;

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

const BASIS_LABEL: Record<PriceBasis, string> = {
  current: "현재 최저가",
  recent: "최근 체결가",
  direct: "직접 확인가",
};

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
    manuallyConfirmedPrice: null,
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

function normalizeProductPrice(product: CatalogProduct, saved?: Partial<ProductPriceData>): ProductPriceData {
  const componentPrices = Object.fromEntries(product.components.map((component) => {
    const price = saved?.componentPrices?.[component.id];
    return [component.id, {
      currentMarketPrice: normalizeNullableNumber(price?.currentMarketPrice),
      recentTradePrice: normalizeNullableNumber(price?.recentTradePrice),
      manuallyConfirmedPrice: normalizeNullableNumber(price?.manuallyConfirmedPrice),
    }];
  }));
  return {
    priceBasis: saved?.priceBasis === "recent" || saved?.priceBasis === "direct" ? saved.priceBasis : "current",
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
      priceBasis: record.priceBasis === "recent" || record.priceBasis === "direct" ? record.priceBasis : "current",
      componentPrices: {
        ...migrated[item.id].componentPrices,
        [component.id]: {
          currentMarketPrice: normalizeNullableNumber(record.currentPrice),
          recentTradePrice: normalizeNullableNumber(record.recentPrice),
          manuallyConfirmedPrice: normalizeNullableNumber(record.directPrice),
        },
      },
      saleLimit: normalizeNullableNumber(record.saleLimit),
      note: typeof record.note === "string" ? record.note : "",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    };
  }
  return migrated;
}

function componentPriceForBasis(price: ComponentMarketPrice, basis: PriceBasis) {
  if (basis === "recent") return price.recentTradePrice ?? 0;
  if (basis === "direct") return price.manuallyConfirmedPrice ?? 0;
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

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<CatalogProduct[]>(DEFAULT_PRODUCTS);
  const [priceData, setPriceData] = useState<PriceDataMap>(() => createInitialPriceData(DEFAULT_PRODUCTS));
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [goalCash, setGoalCash] = useState(1500000);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("base");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ProductDraft | null>(null);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        const nextProducts = parsed.version === STORAGE_VERSION && Array.isArray(parsed.products)
          ? parsed.products as CatalogProduct[]
          : DEFAULT_PRODUCTS;
        setProducts(nextProducts);
        setPriceData(parsed.version === STORAGE_VERSION
          ? normalizePriceData(nextProducts, parsed.priceData)
          : migrateLegacyPriceData(nextProducts, parsed.products));
        if (Array.isArray(parsed.plan)) {
          const validIds = new Set(nextProducts.map((item) => item.id));
          setPlan(parsed.plan.filter((item: PlanItem) => validIds.has(item.productId)));
        }
        if (typeof parsed.goalCash === "number") setGoalCash(parsed.goalCash);
      }
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
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailId(null);
        setEditor(null);
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
        const matchSearch = !normalized || `${product.name} ${product.category} ${product.subcategory ?? ""}`.toLocaleLowerCase("ko-KR").includes(normalized);
        if (!matchSearch) return false;
        if (filter === "mileage") return product.mileage30Eligible;
        if (filter === "noMileage") return !product.mileage30Eligible;
        if (filter === "sellable") return product.active;
        if (filter === "good") return base.gapPercent > 2;
        if (filter === "bad") return base.gapPercent < -2;
        return true;
      })
      .sort((a, b) => {
        const aPrice = getProductPrice(priceData, a);
        const bPrice = getProductPrice(priceData, b);
        const aBase = calculate(a, aPrice, settings);
        const bBase = calculate(b, bPrice, settings);
        if (sort === "mileage") {
          const aValue = a.mileage30Eligible ? calculate(a, aPrice, settings, true).primaryPerEok : Number.POSITIVE_INFINITY;
          const bValue = b.mileage30Eligible ? calculate(b, bPrice, settings, true).primaryPerEok : Number.POSITIVE_INFINITY;
          return aValue - bValue;
        }
        if (sort === "cash") return a.cashPrice - b.cashPrice;
        if (sort === "price") return selectedPrice(a, aPrice) - selectedPrice(b, bPrice);
        if (sort === "comparison") return bBase.gapPercent - aBase.gapPercent;
        if (sort === "updated") return new Date(bPrice.updatedAt || 0).getTime() - new Date(aPrice.updatedAt || 0).getTime();
        return aBase.primaryPerEok - bBase.primaryPerEok;
      });
  }, [products, priceData, search, filter, sort, settings]);

  const bestProduct = useMemo(() => {
    return products
      .filter((product) => product.active && selectedPrice(product, getProductPrice(priceData, product)) > 0)
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

  const updateSettings = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateProduct = (id: string, changes: Partial<CatalogProduct>) => {
    setProducts((current) => current.map((product) => (product.id === id ? { ...product, ...changes } : product)));
  };

  const updateProductPrice = (id: string, changes: Partial<ProductPriceData>) => {
    const product = products.find((candidate) => candidate.id === id);
    if (!product) return;
    setPriceData((current) => ({
      ...current,
      [id]: { ...getProductPrice(current, product), ...changes },
    }));
  };

  const openNewProduct = () => {
    const id = `user-${newPlanId()}`;
    setEditor({
      id,
      name: "",
      category: "사용자 추가",
      subcategory: "",
      cashPrice: 0,
      mileage30Eligible: false,
      active: true,
      components: [{ id: `${id}-component-1`, name: "", quantity: 1 }],
      excludedComponents: [],
      checkedAt: new Date().toISOString().slice(0, 10),
      ...createEmptyProductPrice({
        id,
        name: "",
        category: "사용자 추가",
        cashPrice: 0,
        mileage30Eligible: false,
        active: true,
        components: [{ id: `${id}-component-1`, name: "", quantity: 1 }],
        excludedComponents: [],
        checkedAt: new Date().toISOString().slice(0, 10),
      }),
      isNew: true,
    });
  };

  const updateEditorComponentPrice = (componentId: string, key: keyof ComponentMarketPrice, value: number | null) => {
    setEditor((current) => current ? {
      ...current,
      componentPrices: {
        ...current.componentPrices,
        [componentId]: {
          ...(current.componentPrices[componentId] ?? emptyComponentMarketPrice()),
          [key]: value,
        },
      },
    } : current);
  };

  const saveProduct = () => {
    if (!editor || !editor.name.trim() || editor.cashPrice <= 0) {
      setNotice("상품명과 캐시 가격을 확인해 주세요.");
      return;
    }
    const { isNew, priceBasis, componentPrices, saleLimit, note, updatedAt, ...productFields } = editor;
    const normalizedProduct: CatalogProduct = {
      ...productFields,
      name: productFields.name.trim(),
      subcategory: productFields.subcategory?.trim() || undefined,
      components: productFields.components.map((component) => ({
        ...component,
        name: component.name.trim() || productFields.name.trim(),
        quantity: Math.max(1, Math.floor(component.quantity)),
      })),
    };
    const normalizedPrice: ProductPriceData = { priceBasis, componentPrices, saleLimit, note, updatedAt };
    if (isNew) {
      setProducts((current) => [...current, normalizedProduct]);
      setPriceData((current) => ({ ...current, [normalizedProduct.id]: normalizeProductPrice(normalizedProduct, normalizedPrice) }));
      setNotice("새 상품을 추가했어요.");
    } else {
      setProducts((current) => current.map((product) => (product.id === editor.id ? normalizedProduct : product)));
      setPriceData((current) => ({ ...current, [editor.id]: normalizeProductPrice(normalizedProduct, normalizedPrice) }));
      setNotice("상품 정보를 저장했어요.");
    }
    setEditor(null);
  };

  const deactivateProduct = (product: CatalogProduct) => {
    if (!window.confirm(`‘${product.name}’ 상품을 판매 종료로 표시할까요? 저장된 시세는 유지됩니다.`)) return;
    updateProduct(product.id, { active: false });
    setDetailId(null);
    setEditor(null);
    setNotice("판매 종료로 표시했어요. 저장된 시세는 유지됩니다.");
  };

  const addPlanItem = () => {
    const product = products.find((candidate) => candidate.active) ?? products[0];
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

  const exportData = () => {
    const payload = JSON.stringify({ version: STORAGE_VERSION, exportedAt: new Date().toISOString(), settings, products, priceData, plan, goalCash, mileageReferences: MILEAGE_REFERENCES }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `레드작-계산기-백업-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("JSON 백업 파일을 만들었어요.");
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed.settings || !Array.isArray(parsed.products)) throw new Error("invalid");
      const importedProducts = parsed.version === STORAGE_VERSION ? parsed.products as CatalogProduct[] : DEFAULT_PRODUCTS;
      setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      setProducts(importedProducts);
      setPriceData(parsed.version === STORAGE_VERSION
        ? normalizePriceData(importedProducts, parsed.priceData)
        : migrateLegacyPriceData(importedProducts, parsed.products));
      const validIds = new Set(importedProducts.map((item) => item.id));
      setPlan(Array.isArray(parsed.plan) ? parsed.plan.filter((item: PlanItem) => validIds.has(item.productId)) : []);
      setGoalCash(typeof parsed.goalCash === "number" ? parsed.goalCash : 1500000);
      setNotice("백업 데이터를 불러왔어요.");
    } catch {
      setNotice("올바른 계산기 JSON 파일이 아니에요.");
    }
  };

  const bestCalculation = bestProduct ? calculate(bestProduct, getProductPrice(priceData, bestProduct), settings) : null;
  const bestVerdict = bestCalculation ? verdict(bestCalculation.gapPercent) : null;

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
          <span className="save-state"><i aria-hidden="true" /> 이 기기에 자동 저장</span>
          <button className="text-button" type="button" onClick={exportData}>내보내기</button>
          <button className="text-button" type="button" onClick={() => importRef.current?.click()}>가져오기</button>
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importData} />
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

        <div className="toolbar panel">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품명 검색" aria-label="상품명 검색" />
          </label>
          <div className="filter-tabs" role="group" aria-label="상품 필터">
            {([
              ["all", "전체"],
              ["mileage", "마일30 가능"],
              ["noMileage", "마일 사용 불가"],
              ["sellable", "판매 가능"],
              ["good", "유리"],
              ["bad", "불리"],
            ] as [FilterKey, string][]).map(([key, label]) => (
              <button key={key} className={filter === key ? "active" : ""} type="button" onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          <label className="sort-control">
            <span>정렬</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="base">미적용 효율</option>
              <option value="mileage">마일30 효율</option>
              <option value="cash">캐시 가격</option>
              <option value="price">판매가</option>
              <option value="comparison">직구 대비</option>
              <option value="updated">최근 확인</option>
            </select>
          </label>
        </div>

        <div className="table-panel panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>순위 · 상품</th>
                  <th>캐시 가격</th>
                  <th>판매 기준가</th>
                  <th>실수령 메소</th>
                  <th>마일리지</th>
                  <th>미적용<br />1억당 현금</th>
                  {settings.showMileage && <th>마일30 적용<br />1억당 현금</th>}
                  <th>메소 직구 대비</th>
                  <th>가격 확인</th>
                  <th><span className="visually-hidden">관리</span></th>
                </tr>
              </thead>
              <tbody>
                {rankedProducts.map((product, index) => {
                  const productPrice = getProductPrice(priceData, product);
                  const base = calculate(product, productPrice, settings);
                  const mileage = product.mileage30Eligible ? calculate(product, productPrice, settings, true) : null;
                  const hasPrice = base.salePrice > 0;
                  const state = hasPrice ? verdict(base.gapPercent) : { text: "가격 미입력", className: "neutral" };
                  const priceDivergence = divergence(product, productPrice);
                  const includedCount = totalQuantity(product);
                  const excludedCount = excludedQuantity(product);
                  return (
                    <tr key={product.id} className={!product.active ? "muted-row" : ""}>
                      <td>
                        <div className="product-cell">
                          <span className="rank">{hasPrice ? String(index + 1).padStart(2, "0") : "—"}</span>
                          <div>
                            <button className="product-name" type="button" onClick={() => setDetailId(product.id)}>{product.name}</button>
                            <span className="product-meta">{product.category}{product.subcategory ? ` · ${product.subcategory}` : ""} · {product.active ? "판매 중" : "판매 종료"}</span>
                            {(includedCount > 1 || excludedCount > 0) && <span className="product-meta">전체 {includedCount + excludedCount}개 · 합산 {includedCount}개{excludedCount > 0 ? ` · 계산 제외 ${excludedCount}개` : ""}</span>}
                            {Math.abs(priceDivergence) >= 50 && <span className="warning-line">! 가격 괴리 {priceDivergence >= 0 ? "+" : ""}{formatNumber(priceDivergence)}%</span>}
                          </div>
                        </div>
                      </td>
                      <td><strong>{formatNumber(product.cashPrice)}</strong><small>캐시</small></td>
                      <td>
                        <strong>{formatOptionalEok(base.salePrice)}</strong>
                        <select className="inline-select" value={productPrice.priceBasis} onChange={(event) => updateProductPrice(product.id, { priceBasis: event.target.value as PriceBasis })} aria-label={`${product.name} 판매 가격 기준`}>
                          <option value="current">현재 최저가</option>
                          <option value="recent">최근 체결가</option>
                          <option value="direct">직접 입력가</option>
                        </select>
                      </td>
                      <td><strong>{formatOptionalEok(base.netMeso)}</strong><small>수수료 {formatNumber(settings.auctionFee, 1)}%</small></td>
                      <td>{product.mileage30Eligible ? <span className="yes-chip">30% 가능</span> : <span className="no-chip">사용 불가</span>}</td>
                      <td className="emphasis"><strong>{formatWon(base.primaryPerEok)}</strong>{settings.mileageMode === "direct" && <small>경제적 비용</small>}</td>
                      {settings.showMileage && (
                        <td className="emphasis mileage-value">
                          {mileage ? <><strong>{formatWon(mileage.primaryPerEok)}</strong><small>{formatNumber(mileage.mileageUsed)} 마일 필요</small></> : <span className="dash">—</span>}
                        </td>
                      )}
                      <td>
                        <span className={`result-chip ${state.className}`}>{state.text}</span>
                        <strong className={`comparison ${state.className}`}>{hasPrice ? <>{base.gapPercent >= 0 ? "+" : ""}{formatNumber(base.gapPercent, 1)}%</> : "—"}</strong>
                        <small>{hasPrice ? <>{base.gapWon >= 0 ? "+" : ""}{formatWon(base.gapWon)} / 1억</> : "시세를 입력해 주세요"}</small>
                      </td>
                      <td><strong className="date-value">{formatDate(productPrice.updatedAt)}</strong><small>{BASIS_LABEL[productPrice.priceBasis]}</small></td>
                      <td><button className="icon-button" type="button" aria-label={`${product.name} 수정`} onClick={() => setEditor({ ...product, ...productPrice })}>•••</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rankedProducts.length === 0 && (
            <div className="empty-state"><span>⌕</span><h3>조건에 맞는 상품이 없어요.</h3><p>검색어 또는 필터를 바꿔 보세요.</p></div>
          )}
          <div className="table-footnote"><span>2026-08-23 판매 스냅샷 · 경매장 가격은 사용자 입력값만 사용합니다.</span><span>{formatNumber(rankedProducts.length)} / {formatNumber(INITIAL_DATA_COUNTS.currentProducts)}개 표시 중</span></div>
        </div>
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
                        {products.filter((candidate) => candidate.active).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
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
            <p className="modal-lead">가격은 억 메소 단위로 입력합니다. 변경 내용은 이 기기에 자동 저장됩니다.</p>
            <div className="editor-grid">
              <label className="full"><span>상품명</span><input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="예: 플래티넘 카르마의 가위" autoFocus /></label>
              <label><span>카테고리</span><select value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value as CatalogProduct["category"] })}><option value="기본">기본</option><option value="확률형">확률형</option><option value="번들">번들</option><option value="쿠폰">쿠폰</option><option value="직업 코디">직업 코디</option><option value="보스 코디">보스 코디</option><option value="사용자 추가">사용자 추가</option></select></label>
              <label><span>세부 분류</span><input value={editor.subcategory ?? ""} onChange={(event) => setEditor({ ...editor, subcategory: event.target.value })} placeholder="예: 모험가" /></label>
              <label><span>캐시 가격</span><span className="affix-input"><input type="number" min="0" value={editor.cashPrice} onChange={(event) => setEditor({ ...editor, cashPrice: safeNumber(event.target.value) })} /><small>캐시</small></span></label>
              <label><span>판매 스냅샷 확인일</span><input type="date" value={editor.checkedAt} onChange={(event) => setEditor({ ...editor, checkedAt: event.target.value })} /></label>
              <label><span>계산 가격 기준</span><select value={editor.priceBasis} onChange={(event) => setEditor({ ...editor, priceBasis: event.target.value as PriceBasis })}><option value="current">현재 최저가</option><option value="recent">최근 체결가</option><option value="direct">직접 확인가</option></select></label>
              <label><span>예상 판매 가능 수량</span><span className="affix-input"><input type="number" min="0" value={editor.saleLimit ?? ""} placeholder="미설정" onChange={(event) => setEditor({ ...editor, saleLimit: optionalNumber(event.target.value) })} /><small>개</small></span></label>
              <label><span>마지막 가격 확인</span><input type="datetime-local" value={editor.updatedAt.slice(0, 16)} onChange={(event) => setEditor({ ...editor, updatedAt: event.target.value })} /></label>
              <label className="editor-check"><input type="checkbox" checked={editor.mileage30Eligible} onChange={(event) => setEditor({ ...editor, mileage30Eligible: event.target.checked })} /><span><b>마일리지 30% 사용 가능</b><small>미적용·적용 효율을 함께 계산합니다.</small></span></label>
              <label className="editor-check"><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} /><span><b>현재 판매 중</b><small>끄면 시세를 보존한 채 판매 종료로 표시합니다.</small></span></label>
              <section className="component-price-editor full">
                <div className="component-editor-heading">
                  <div><strong>판매가 합산 구성품</strong><small>구성품별 경매장 가격을 억 메소 단위로 입력합니다.</small></div>
                  <span>전체 {totalQuantity(editor) + excludedQuantity(editor)}개 · 합산 {totalQuantity(editor)}개{excludedQuantity(editor) > 0 ? ` · 계산 제외 ${excludedQuantity(editor)}개` : ""}</span>
                </div>
                <div className="component-price-head" aria-hidden="true"><span>구성품</span><span>현재 최저가</span><span>최근 체결가</span><span>직접 확인가</span></div>
                {editor.components.map((component) => {
                  const componentPrice = editor.componentPrices[component.id] ?? emptyComponentMarketPrice();
                  return (
                    <div className="component-price-row" key={component.id}>
                      <span className="component-name">{component.name || editor.name || "상품명과 동일"}{component.quantity > 1 ? ` × ${component.quantity}` : ""}</span>
                      <span className="affix-input"><input type="number" min="0" step="0.01" value={componentPrice.currentMarketPrice ?? ""} placeholder="비어 있음" aria-label={`${component.name || editor.name} 현재 최저가`} onChange={(event) => updateEditorComponentPrice(component.id, "currentMarketPrice", optionalNumber(event.target.value))} /><small>억</small></span>
                      <span className="affix-input"><input type="number" min="0" step="0.01" value={componentPrice.recentTradePrice ?? ""} placeholder="비어 있음" aria-label={`${component.name || editor.name} 최근 체결가`} onChange={(event) => updateEditorComponentPrice(component.id, "recentTradePrice", optionalNumber(event.target.value))} /><small>억</small></span>
                      <span className="affix-input"><input type="number" min="0" step="0.01" value={componentPrice.manuallyConfirmedPrice ?? ""} placeholder="비어 있음" aria-label={`${component.name || editor.name} 직접 확인가`} onChange={(event) => updateEditorComponentPrice(component.id, "manuallyConfirmedPrice", optionalNumber(event.target.value))} /><small>억</small></span>
                    </div>
                  );
                })}
                {editor.excludedComponents.length > 0 && <div className="excluded-components"><strong>계산 제외 구성품</strong><span>{editor.excludedComponents.map((component) => `${component.name}${component.quantity > 1 ? ` × ${component.quantity}` : ""}`).join(" · ")}</span></div>}
              </section>
              <label className="full"><span>메모</span><textarea value={editor.note} onChange={(event) => setEditor({ ...editor, note: event.target.value })} placeholder="판매 속도, 시세 특이사항 등을 기록하세요." /></label>
            </div>
            <div className="modal-actions">
              {!editor.isNew && editor.active && <button className="danger-button" type="button" onClick={() => deactivateProduct(editor)}>판매 종료 처리</button>}
              <button className="secondary-button" type="button" onClick={() => setEditor(null)}>취소</button>
              <button className="primary-button" type="button" onClick={saveProduct}>저장하기</button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
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
        <div><h2 id="detail-title">{product.name}</h2><p>{product.category}{product.subcategory ? ` · ${product.subcategory}` : ""} · {BASIS_LABEL[priceData.priceBasis]} 기준 · 판매 확인 {product.checkedAt}</p></div>
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
