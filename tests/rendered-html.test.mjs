import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the current profit calculator", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /<title>레드작 손익 계산기<\/title>/i);
  assert.match(html, /<main>/i);
  assert.match(html, /감이 아닌 숫자로(?:<br\s*\/?>)레드작을 결정하세요\./i);
  assert.match(html, /id="products"/i);
  assert.match(html, /상품 효율 순위/);
  assert.match(html, /현재 메소 현금 시세/);
  assert.match(html, /상품명·패키지·구성품 검색/);
  assert.match(html, /aria-expanded="false"/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|SkeletonPreview/i);
});

test("keeps finished source free of starter preview scaffolding", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /title:\s*"레드작 손익 계산기"/);
  assert.match(layout, /<html lang="ko">/);
  assert.match(page, /id="products"/);
  assert.match(page, /aria-expanded=\{isExpanded\}/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("separates the ranking list from the component price grid", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const tabletStart = css.lastIndexOf("@media (max-width: 1199px)");
  const mobileStart = css.lastIndexOf("@media (max-width: 767px)");
  const narrowMobileStart = css.lastIndexOf("@media (max-width: 420px)");
  const tabletStyles = css.slice(tabletStart, mobileStart);
  const mobileStyles = css.slice(mobileStart, narrowMobileStart);
  const narrowMobileStyles = css.slice(narrowMobileStart);

  assert.match(page, /className="product-card-list"/);
  assert.match(page, /className="component-price-grid"/);
  assert.match(css, /\.product-card-list\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.doesNotMatch(css, /\.product-card-list\s*\{[^}]*repeat\((?:2|3),/s);
  assert.match(css, /\.component-price-grid\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(tabletStyles, /\.component-price-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobileStyles, /\.component-price-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(page, /마일30 가능/);
  assert.match(page, /구성 \{includedCount \+ excludedCount\}개/);
  assert.match(page, /\{formatNumber\(product\.cashPrice\)\}캐시/);
  assert.match(css, /\.card-product-name > strong\s*\{[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*break-word;/s);
  assert.match(css, /\.card-row-metric > strong\s*\{[^}]*display:\s*inline-flex;[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /\.card-efficiency-value > em\s*\{[^}]*display:\s*inline-flex;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.card-efficiency-value > em\s*\{[^}]*white-space:\s*normal;/s);
  assert.match(page, /const \[showSaleEditor, setShowSaleEditor\] = useState\(false\)/);
  assert.match(page, /\{showSaleEditor && \(\s*<section className="accordion-sale-editor"/s);
  assert.match(page, /aria-expanded=\{showSaleEditor\}/);
  assert.match(page, /showSaleEditor \? "판매 상태 닫기" : "판매 상태 편집"/);
  assert.doesNotMatch(page, /현재 적용:/);
  assert.match(css, /\.accordion-actions \.primary-button\s*\{[^}]*background:\s*#806753;/s);
  assert.match(css, /\.accordion-actions \.secondary-button\s*\{[^}]*background:\s*#fffdf9;/s);
  assert.match(tabletStyles, /\.accordion-meta\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.doesNotMatch(page, /className="accordion-result-strip"/);
  assert.match(page, /const hasComponentSummary = includedCount > 1 \|\| excludedCount > 0/);
  assert.match(page, /\{hasComponentSummary && \(\s*<section className="component-price-summary"/s);
  assert.match(page, /componentPriceForBasis\(componentPrice, priceData\.priceBasis\) \* component\.quantity/);
  assert.match(css, /\.component-price-summary-grid\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(tabletStyles, /\.component-price-summary-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobileStyles, /\.component-price-summary-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(narrowMobileStyles, /\.component-price-summary-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
});

test("keeps catalog corrections, mileage comparison, and ended-product ordering", async () => {
  const [page, catalog, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(catalog, /레지스탕스 메카닉 무기|레지스탕스 배틀메이지 모자|림보 날/);
  assert.match(catalog, /레지스탕스 메카닉 건/);
  assert.match(catalog, /레지스탕스 배틀메이지 고글/);
  assert.match(catalog, /림보 탈/);
  assert.match(catalog, /adventurer-15[^\n]*모험가 나이트로드 헤어밴드\(남\)/);
  assert.match(catalog, /adventurer-16[^\n]*모험가 나이트로드 헤어밴드\(여\)/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.currentProducts !== 134/);

  assert.doesNotMatch(catalog, /"reference"|"mileageReference"|MILEAGE_REFERENCES|붕어빵 뿌리기 11개|달콤한 붕어빵 11개|슈퍼파워버프|마슈르의 선물기상효과/);
  assert.doesNotMatch(page, /"reference"|"mileageReference"|마일리지 참고/);
  assert.doesNotMatch(css, /category-reference|reference-detail-note/);

  assert.match(page, /settings\.showMileage && product\.mileage30Eligible && hasPrice/);
  assert.match(page, /className="card-mileage-comparison"/);
  assert.match(page, /<b>마일30<\/b>/);
  assert.match(page, /formatNumber\(mileage\.mileageUsed\)\}마일/);
  assert.match(css, /\.card-mileage-comparison\s*\{[^}]*display:\s*inline-flex;[^}]*white-space:\s*nowrap;/s);

  assert.match(page, /const aEnded = effectiveProductStatus\(a\) === "ended" \? 1 : 0;/);
  assert.match(page, /if \(aEnded !== bEnded\) return aEnded - bEnded;/);
  assert.match(page, /const isEnded = effectiveProductStatus\(product\) === "ended";/);
  assert.match(page, /!isEnded && hasPrice \? String\(rank\)\.padStart\(2, "0"\) : "—"/);

  assert.match(page, /RENAMED_BUILT_IN_COMPONENT_IDS/);
  assert.match(page, /REQUIRED_BUILT_IN_EXCLUDED_COMPONENT_IDS/);
  assert.match(page, /fallbackComponents\.get\(component\.id\)/);
  assert.match(page, /saved\?\.componentPrices\?\.\[component\.id\]/);
});

test("uses the simplified catalog taxonomy and preserves legacy saved values", async () => {
  const [page, catalog, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const categoryType = catalog.match(/export type ProductCategory =[\s\S]*?;/)?.[0] ?? "";
  const subcategoryType = catalog.match(/export type ProductSubcategory =[\s\S]*?;/)?.[0] ?? "";
  const subcategoryOptions = catalog.match(/export const SUBCATEGORY_OPTIONS[\s\S]*?\n};/)?.[0] ?? "";
  const categoryFilters = page.match(/const CATEGORY_FILTER_OPTIONS[\s\S]*?\n];/)?.[0] ?? "";

  assert.match(categoryType, /"basic"[\s\S]*"random"[\s\S]*"coupon"[\s\S]*"job"[\s\S]*"boss"/);
  assert.doesNotMatch(categoryType, /"bundle"|"reference"/);
  assert.match(subcategoryOptions, /basic: \["utility", "transferScroll", "prism"\]/);
  assert.match(subcategoryOptions, /random: \["royal", "lunaCrystal", "wonderberry", "boutique", "platinumApple", "masterpiece"\]/);
  assert.match(subcategoryOptions, /coupon: \["hair", "face", "mixCoupon", "genderChange"\]/);
  assert.doesNotMatch(subcategoryType, /"ring"|"scroll"|"color"|"crystal"|"gift"|"mixDye"|"mixLens"|"allJob"|"best"/);
  assert.doesNotMatch(categoryFilters, /"bundle"|"reference"|묶음|마일리지 참고/);

  assert.match(catalog, /product\("basic-07", "컬러링 프리즘 프로", "basic", 25000, \{ subcategory: "prism", mileage30Eligible: true \}\)/);
  assert.match(catalog, /product\("basic-08", "무기 이펙트 프리즘", "basic", 15000, \{ subcategory: "prism", mileage30Eligible: true \}\)/);
  assert.match(catalog, /product\("bundle-01", "부티크 기프트", "random", 3300, \{ subcategory: "boutique", status: "ended" \}\)/);
  assert.match(catalog, /product\("bundle-02", "부티크 기프트 10개", "random", 33000, \{ subcategory: "boutique", tags: \["multiPack"\], status: "ended", components: \[\["부티크 기프트", 10\]\] \}\)/);
  assert.doesNotMatch(catalog, /뷰티크 기프트/);

  assert.match(catalog, /coupon-03[^\n]*subcategory: "hair"[^\n]*tags: \["best"\]/);
  assert.match(catalog, /coupon-04[^\n]*subcategory: "face"[^\n]*tags: \["best"\]/);
  assert.match(catalog, /coupon-05[^\n]*subcategory: "hair"[^\n]*tags: \["boss"\]/);
  assert.match(catalog, /coupon-09[^\n]*subcategory: "hair"[^\n]*tags: \["allJob", "illustrationCollection"\]/);
  assert.match(catalog, /coupon-11[^\n]*subcategory: "mixCoupon"/);
  assert.match(catalog, /coupon-12[^\n]*subcategory: "mixCoupon"/);

  assert.match(catalog, /INITIAL_DATA_COUNTS\.basicProducts !== 8/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.randomProducts !== 10/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.couponProducts !== 14/);
  assert.match(catalog, /CURRENT_PRODUCTS\.filter\(\(item\) => item\.mileage30Eligible\)\.length !== 8/);
  assert.match(page, /const STORAGE_VERSION = 8/);
  assert.match(page, /ring: "utility"/);
  assert.match(page, /bundle: "random"/);
  assert.match(page, /gift: "boutique"/);
  assert.match(page, /crystal: "lunaCrystal"/);
  assert.match(page, /scroll: "transferScroll"/);
  assert.match(page, /color: "prism"/);
  assert.match(page, /mixDye: "mixCoupon"/);
  assert.match(page, /mixLens: "mixCoupon"/);
  assert.match(page, /category: fallback\.category/);
  assert.match(page, /subcategory: fallback\.subcategory/);
  assert.match(page, /RENAMED_BUILT_IN_PRODUCT_IDS/);
  assert.match(page, /"bundle-01-component-1"/);
  assert.match(page, /"bundle-02-component-1"/);
  assert.match(page, /saved\?\.componentPrices\?\.\[component\.id\]/);
  assert.match(page, /product\.tags\.map\(\(tag\) => PRODUCT_TAG_LABELS\[tag\]\)/);
  assert.match(css, /\.product-tag-badge/);
  assert.doesNotMatch(css, /\.category-bundle/);
});

test("adds the new random and freestyle products without changing calculation behavior", async () => {
  const [page, catalog, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /product\("basic-02", "혈맹의 반지", "basic", 5900, \{ subcategory: "utility" \}\)/);
  assert.doesNotMatch(catalog, /subcategory: "ring"/);
  assert.match(catalog, /platinumApple: "플래티넘 애플"/);
  assert.match(catalog, /masterpiece: "마스터피스"/);
  assert.match(catalog, /product\("random-06", "플래티넘 애플", "random", 3500, \{ subcategory: "platinumApple" \}\)/);
  assert.match(catalog, /product\("random-07", "플래티넘 애플 33개", "random", 99000, \{ subcategory: "platinumApple", tags: \["multiPack"\], components: \[\["플래티넘 애플", 33\]\] \}\)/);
  assert.match(catalog, /product\("random-08", "프리미엄 마스터피스", "random", 1900, \{ subcategory: "masterpiece" \}\)/);
  assert.match(catalog, /product\("coupon-13", "프리스타일 쿠폰", "coupon", 5500, \{ tags: \["freestyle"\] \}\)/);
  assert.match(catalog, /product\("coupon-14", "프리스타일 쿠폰 10개", "coupon", 49500, \{ tags: \["freestyle", "multiPack"\], components: \[\["프리스타일 쿠폰", 10\]\] \}\)/);
  assert.match(catalog, /freestyle: "프리스타일"/);
  assert.doesNotMatch(catalog.match(/export const SUBCATEGORY_OPTIONS[\s\S]*?\n};/)?.[0] ?? "", /freestyle/);
  assert.match(page, /tag !== "mileage30" && tag !== "multiPack" && tag !== "freestyle"/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.basicProducts !== 8/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.randomProducts !== 10/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.couponProducts !== 14/);
  assert.match(catalog, /INITIAL_DATA_COUNTS\.currentProducts !== 134/);
  assert.match(page, /ring: "utility"/);
  assert.match(page, /category: fallback\.category/);
  assert.match(page, /subcategory: fallback\.subcategory/);
  assert.match(page, /saved\?\.componentPrices\?\.\[component\.id\]/);
  assert.match(css, /\.filter-tabs button\s*\{[^}]*white-space:\s*nowrap;/s);
});
