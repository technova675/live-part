import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { postPresentation } from "../lib/post-media.ts";

// Render the actual attachment component without adding fixture routes or database rows.
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/creator/[username]/post-media.tsx", import.meta.url), "utf8"),
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const componentSource = `import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};\n${compiled}`;
const { PostMedia } = await import(`data:text/javascript;base64,${Buffer.from(componentSource).toString("base64")}`);
const render = (presentation) => renderToStaticMarkup(React.createElement(PostMedia, { post: { ...presentation, url: "https://x.com/example/status/1" } }));
const photo = { type: "photo", mediaUrl: "https://example.com/one.jpg", url: "https://t.co/media", extAltText: "A photograph" };
const card = { url: "https://t.co/card", bindingValues: { title: "Article title", description: "Article description", domain: "example.com", summaryPhotoImage: { url: "https://example.com/card.jpg" } } };
const entities = { urls: [{ url: card.url, expandedUrl: "https://example.com/article" }] };

test("photo grids render every image and remove only their represented media link", () => {
  const data = postPresentation("Post https://t.co/media https://example.com/keep", [photo, { ...photo, mediaUrl: "https://example.com/two.jpg" }], null, {});
  assert.equal(data.text, "Post  https://example.com/keep");
  const html = render(data);
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.ok(html.includes("grid-cols-2"));
  assert.ok(html.includes("A photograph"));
});

test("Xquik videoVariants choose the highest bitrate MP4 with native playback controls", () => {
  const data = postPresentation("Video https://t.co/media", [{ ...photo, type: "video", videoVariants: [
    { contentType: "application/x-mpegURL", url: "https://example.com/stream.m3u8" },
    { contentType: "video/mp4", bitrate: 200, url: "https://example.com/low.mp4" },
    { contentType: "video/mp4", bitrate: 1000, url: "https://example.com/high.mp4" },
  ] }], card, entities);
  const html = render(data);
  assert.ok(html.includes("<video controls="));
  assert.ok(html.includes("high.mp4"));
  assert.ok(!html.includes("low.mp4"));
  assert.equal(data.card, null);
});

test("card-only posts render expanded destinations, preview images, titles and descriptions", () => {
  const data = postPresentation("Read this https://t.co/card", [], card, entities);
  const html = render(data);
  assert.equal(data.text, "Read this");
  assert.ok(html.includes('href="https://example.com/article"'));
  assert.ok(html.includes("Article title"));
  assert.ok(html.includes("Article description"));
  assert.ok(html.includes("card.jpg"));
});

test("cards are suppressed when photos exist, and text-only posts have no preview", () => {
  const data = postPresentation("Photo", [photo], card, entities);
  assert.ok(!render(data).includes("Article title"));
  assert.equal(render(postPresentation("Just text", null, null, null)), "");
});

test("animated GIFs loop silently and videos without playable variants link to X", () => {
  const gif = postPresentation("", [{ ...photo, type: "animated_gif", videoInfo: { variants: [{ contentType: "video/mp4", url: "https://example.com/animation.mp4" }] } }], null, {});
  const html = render(gif);
  assert.ok(html.includes("autoPlay="));
  assert.ok(html.includes("loop="));
  assert.ok(html.includes("muted="));
  assert.ok(!html.includes("controls="));
  const missing = render(postPresentation("", [{ ...photo, type: "video" }], null, {}));
  assert.ok(missing.includes("Watch on X"));
  assert.ok(!missing.includes("<video"));
});

test("legacy card bindings work and unsafe preview URLs are rejected", () => {
  const legacy = { url: "https://example.com", binding_values: [
    { key: "title", value: { string_value: "Legacy title" } },
    { key: "thumbnail_image", value: { image_value: { url: "https://example.com/legacy.jpg" } } },
  ] };
  const html = render(postPresentation(null, [], legacy, {}));
  assert.ok(html.includes("Legacy title"));
  assert.ok(html.includes("legacy.jpg"));
  assert.equal(postPresentation("", [], { url: "javascript:alert(1)" }, {}).card, null);
});
