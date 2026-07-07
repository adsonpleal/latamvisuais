#!/usr/bin/env node
// Post the current version's "novidades" to Discord after a deploy.
//
// Standard message = project name + version + the user-facing bullet points of
// the newest entry, as a single embed. The source of truth is the FIRST entry
// of the CHANGELOG array in src/changelog.ts — the exact same list the app shows
// in its "Novidades" window (APP_VERSION is derived from it), so there is no
// separate data file to keep in sync. The deploy workflow only runs this when
// that top version actually changed (see firebase-hosting-merge.yml).
//
// Usage:
//   DISCORD_BOT_TOKEN=xxx node tools/post-novidades.mjs   # posts
//   node tools/post-novidades.mjs --dry-run               # prints payload, no network
//   node tools/post-novidades.mjs --print-version         # prints the top version, nothing else
//
// Env:
//   DISCORD_BOT_TOKEN   (required to post) — a bot token; keep it in a GitHub
//                       Actions secret, never in the repo.
//   DISCORD_CHANNEL_ID  (optional) — defaults to the channel below.
//
// Exit codes: 0 = posted / dry-run / not-configured (no token). 1 = a token was
// given but the Discord API rejected the request (surface real misconfig).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROJECT_NAME = "Simulador de Visuais";
const SITE_URL = "https://latam-visuais.web.app";
const DEFAULT_CHANNEL_ID = "1524025278471471295"; // #novidades (shared LATAM tools)
const EMBED_COLOR = 0x3f6cd1; // --accent (blue), matches the app theme
const DISCORD_DESC_LIMIT = 4096;

// Read a double-quoted string literal starting at/after `from`, resolving the
// escapes that appear in changelog.ts. Returns { value, end } or null.
function grabString(src, from) {
  let i = src.indexOf('"', from);
  if (i < 0) return null;
  i++;
  let out = "";
  while (i < src.length && src[i] !== '"') {
    if (src[i] === "\\") {
      const n = src[i + 1];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n;
      i += 2;
    } else {
      out += src[i++];
    }
  }
  return { value: out, end: i + 1 };
}

// Parse the FIRST { version, date, changes, credit? } entry of the CHANGELOG
// array. We scan the string literals directly so changelog.ts stays a plain TS
// module (no build step, no separate JSON to maintain).
function readLatestEntry() {
  const src = readFileSync(resolve(ROOT, "src/changelog.ts"), "utf8");
  const arrAt = src.indexOf("CHANGELOG");
  const firstBrace = src.indexOf("{", src.indexOf("[", arrAt));
  if (firstBrace < 0) return null;
  // Bound to the first entry: stop at the next entry's "version:" key.
  const secondVersion = src.indexOf("version:", src.indexOf("version:", firstBrace) + 1);
  const scope = src.slice(firstBrace, secondVersion < 0 ? src.length : secondVersion);

  const grab = (label) => {
    const at = scope.indexOf(label);
    return at < 0 ? null : grabString(scope, at + label.length)?.value ?? null;
  };
  const version = grab("version:");
  const date = grab("date:");

  const changes = [];
  const open = scope.indexOf("[", scope.indexOf("changes:"));
  let i = open + 1;
  while (i < scope.length) {
    while (i < scope.length && /[\s,]/.test(scope[i])) i++;
    if (scope[i] !== '"') break; // reached the closing ]
    const got = grabString(scope, i);
    if (!got) break;
    changes.push(got.value);
    i = got.end;
  }
  const credit = grab("credit:");
  return { version, date, changes, credit };
}

function buildEmbed({ version, date, changes, credit }) {
  let description = changes.map((c) => `• ${c}`).join("\n\n");
  if (credit) description += `\n\n*${credit}*`;
  if (description.length > DISCORD_DESC_LIMIT) {
    description = description.slice(0, DISCORD_DESC_LIMIT - 1) + "…";
  }
  const host = SITE_URL.replace("https://", "");
  return {
    title: `${PROJECT_NAME} — v${version}`,
    url: SITE_URL,
    description,
    color: EMBED_COLOR,
    footer: { text: date ? `Publicado em ${date} • ${host}` : host },
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  const entry = readLatestEntry();

  if (process.argv.includes("--print-version")) {
    process.stdout.write((entry?.version ?? "") + "\n");
    return;
  }

  if (!entry || entry.changes.length === 0) {
    console.warn("No changes in the newest src/changelog.ts entry — nothing to post.");
    return;
  }

  const payload = { embeds: [buildEmbed(entry)] };

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("DISCORD_BOT_TOKEN not set — skipping Discord post (not configured).");
    return;
  }
  const channelId = process.env.DISCORD_CHANNEL_ID || DEFAULT_CHANNEL_ID;

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Discord API ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Posted novidades for v${entry.version} to channel ${channelId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
