import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const pagesDist = new URL("../pages-dist/", import.meta.url);

test("builds a repository-subpath-safe static site", async () => {
  const html = await readFile(new URL("index.html", pagesDist), "utf8");
  const assetReferences = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.startsWith("data:"));

  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /<title>레드작 손익 계산기<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.ok(assetReferences.length >= 3);
  assert.ok(assetReferences.every((reference) => reference.startsWith("./")));
  assert.doesNotMatch(html, /\/_next\//i);

  await access(new URL("favicon.svg", pagesDist));
  await access(new URL(".nojekyll", pagesDist));
});

test("emits browser-only assets without server routes", async () => {
  const files = await readdir(new URL("assets/", pagesDist));
  assert.ok(files.some((file) => file.endsWith(".js")));
  assert.ok(files.some((file) => file.endsWith(".css")));
  await assert.rejects(access(new URL("server/", pagesDist)));
});
