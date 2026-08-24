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
