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

  assert.match(page, /className="product-card-list"/);
  assert.match(page, /className="component-price-grid"/);
  assert.match(css, /\.product-card-list\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.doesNotMatch(css, /\.product-card-list\s*\{[^}]*repeat\((?:2|3),/s);
  assert.match(css, /\.component-price-grid\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(tabletStyles, /\.component-price-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobileStyles, /\.component-price-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(page, /마일30 가능/);
  assert.match(page, /구성 \{includedCount \+ excludedCount\}개/);
  assert.match(page, /`\$\{formatNumber\(product\.cashPrice\)\}캐시`/);
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
});
