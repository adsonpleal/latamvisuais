#!/usr/bin/env node
// Post-build SEO prerender. The app is a client-rendered SPA, so the shipped
// index.html has no crawlable content beyond the shell. This fills the
// <!--SEO_PRERENDER--> marker inside #app with a static, hidden section listing
// the real thing worth indexing: every playable class and every costume name
// (the long-tail "<visual> Ragnarok" queries), read from the same public/db
// JSON the app loads at runtime.
//
// React's createRoot clears #app on mount, so this block is only ever seen by
// crawlers and no-JS clients — the `hidden` attribute keeps it from flashing
// for real users in the moment before hydration.
//
// Runs as the last step of `npm run build` (after `vite build`), rewriting
// dist/index.html in place. Fails loudly if the marker or data is missing so a
// regression can't silently ship an empty shell.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist/index.html");
const MARKER = "<!--SEO_PRERENDER-->";

// Human-readable pt-BR label per visual slot (mirrors the UI).
const SLOT_LABELS = { top: "Topo", mid: "Meio", low: "Baixo", garment: "Capa" };
const SLOT_ORDER = ["top", "mid", "low", "garment"];

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

// Minimal HTML-text escaping — costume names carry &, [], etc.
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function build() {
  const classes = readJson("public/db/classes.json").classes ?? [];
  const costumes = readJson("public/db/costumes.json").items ?? [];

  // Released classes only (drop the unreleased LATAM placeholders), by name.
  const classNames = classes
    .filter((c) => !c.unreleased)
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Costume names grouped by slot, deduped and sorted pt-BR. A multi-slot
  // costume is listed under each slot it can occupy.
  const bySlot = new Map(SLOT_ORDER.map((s) => [s, new Set()]));
  for (const item of costumes) {
    for (const slot of item.slots ?? []) {
      bySlot.get(slot)?.add(item.name);
    }
  }

  if (!classNames.length || ![...bySlot.values()].some((s) => s.size)) {
    throw new Error("prerender-seo: no class/costume data — is public/db populated?");
  }

  const parts = [
    '<section id="seo-content" hidden aria-hidden="true">',
    "<h1>Simulador de Visuais — Ragnarok Online LATAM</h1>",
    "<p>Monte o visual do seu personagem do Ragnarok Online LATAM diretamente no " +
      "navegador: escolha a classe, o gênero, o estilo e a cor do cabelo, a cor da " +
      "roupa e os 4 slots de visual (Topo, Meio, Baixo e Capa). Compartilhe o visual " +
      "montado por link e explore os mapas do jogo.</p>",
    "<h2>Classes</h2>",
    "<ul>" + classNames.map((n) => `<li>${esc(n)}</li>`).join("") + "</ul>",
  ];

  let costumeCount = 0;
  for (const slot of SLOT_ORDER) {
    const names = [...bySlot.get(slot)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (!names.length) continue;
    costumeCount += names.length;
    parts.push(`<h2>Visuais de ${SLOT_LABELS[slot]}</h2>`);
    parts.push("<ul>" + names.map((n) => `<li>${esc(n)}</li>`).join("") + "</ul>");
  }
  parts.push("</section>");

  return { html: parts.join(""), classCount: classNames.length, costumeCount };
}

function main() {
  const { html, classCount, costumeCount } = build();
  const page = readFileSync(DIST, "utf8");
  if (!page.includes(MARKER)) {
    throw new Error(`prerender-seo: marker ${MARKER} not found in dist/index.html`);
  }
  writeFileSync(DIST, page.replace(MARKER, html), "utf8");
  console.log(
    `prerender-seo: injected ${classCount} classes + ${costumeCount} costume entries into dist/index.html`,
  );
}

main();
