// Unit tests for the string handling the pipeline cannot get wrong quietly.
//
// Only the modules with no ragassets dependency are tested here: the rest import
// extract-grf.mjs at load time, which is a path on the operator's machine rather
// than something CI has.

import { describe, expect, it } from "vitest";
import { sep } from "node:path";

// The sex marks that prefix every headgear sprite file name.
const SEX_M = "남";
const SEX_F = "여";
// A headgear sprite's real path shape, which `originCanDraw` reads.
const accPath = (sex, key = "chapeu") =>
  `data/sprite/악세사리/${sex}/${sex}${key}.spr`;
import { ORIGINS, parsePatchList, rgzProbeOrder, selectOrigins, GRF_EXT, RGZ_EXT } from "./origins.mjs";
import { normalizePath, robeTargets, spriteTargets, targetsFor } from "./pathshapes.mjs";
import { legacyNameCoverage } from "./coverage.mjs";
import {
  bestSlotOfStep,
  blockedFrom,
  coverPlan,
  originCanDraw,
  planStats,
  rowKey,
  targetsOf,
} from "./stage4-plan.mjs";
import { COALESCE_GAP, coalesceSpans, fileEntries, rangeCost } from "./ranges.mjs";
import {
  buildCatalogue,
  catalogueDocument,
  costumeDraws,
  originsFromPaths,
  planByCostume,
  slotsByCostume,
  treeProbe,
} from "./stage5-catalogue.mjs";
import {
  SLOT_PRIORITY,
  bestSlot,
  kindFromSlots,
  parseSlotValue,
  parseSlotsFromLines,
  slotRank,
} from "./slots.mjs";

describe("parsePatchList", () => {
  // The real shape, taken from twRO's patch3.txt and jRO's patch2.txt.
  const index = [
    "// taiwan roz live",
    "9431\t2026-11-17_live_client_4590_4596_1794800000.gpf",
    "\t//9432 2026-11-17_pulled.rgz",
    "9433 2026-11-17_Raghash_1794814779.rgz",
    "",
  ].join("\n");

  it("reads sequence and filename, and skips pulled patches by default", () => {
    const got = parsePatchList(index);
    expect(got).toEqual([
      { seq: 9431, file: "2026-11-17_live_client_4590_4596_1794800000.gpf", pulled: false },
      { seq: 9433, file: "2026-11-17_Raghash_1794814779.rgz", pulled: false },
    ]);
  });

  it("can include the pulled ones, flagged", () => {
    const got = parsePatchList(index, { includePulled: true });
    expect(got.map((e) => [e.seq, e.pulled])).toEqual([
      [9431, false],
      [9432, true],
      [9433, false],
    ]);
  });

  it("ignores comment lines that are not patch entries", () => {
    expect(parsePatchList("// End of Patch\n\n")).toEqual([]);
  });
});

describe("archive extensions", () => {
  it("separates the ones with a file table from the gzip ones", () => {
    for (const f of ["a.gpf", "a.gsf", "a.gef", "a.grf", "A.GPF"]) {
      expect(GRF_EXT.test(f), f).toBe(true);
      expect(RGZ_EXT.test(f), f).toBe(false);
    }
    expect(RGZ_EXT.test("2026-11-17_Raghash_1794814779.rgz")).toBe(true);
    expect(GRF_EXT.test("2026-11-17_Raghash_1794814779.rgz")).toBe(false);
  });
});

describe("selectOrigins", () => {
  it("defaults to everything and understands 'foreign' and a list", () => {
    expect(selectOrigins().length).toBe(Object.keys(ORIGINS).length);
    expect(selectOrigins("foreign").some((o) => o.id === "latam")).toBe(false);
    expect(selectOrigins("twro,jro").map((o) => o.id)).toEqual(["twro", "jro"]);
  });

  it("refuses an origin it does not know, rather than silently doing nothing", () => {
    expect(() => selectOrigins("bro")).toThrow(/unknown origin/);
  });
});

describe("normalizePath", () => {
  it("makes the two spellings of the same GRF path compare equal", () => {
    const a = String.raw`data\LuaFiles514\Lua Files\Datainfo\AccName.lub`;
    const b = String.raw`data\luafiles514\lua files\datainfo\accname.lub`;
    expect(normalizePath(a)).toBe(normalizePath(b));
    expect(normalizePath(a)).toBe("data/luafiles514/lua files/datainfo/accname.lub");
  });
});

describe("spriteTargets", () => {
  it("keeps the underscore for the headgear files and drops it for the effect folder", () => {
    expect(spriteTargets("_C_Chained_Bear")).toEqual([
      "/sprite/악세사리/남/남_c_chained_bear.",
      "/sprite/악세사리/여/여_c_chained_bear.",
      "/sprite/이팩트/c_chained_bear/",
    ]);
  });

  it("matches the real paths a patch table carries", () => {
    const targets = spriteTargets("_C_Chained_Bear");
    const real = [
      String.raw`data\sprite\악세사리\남\남_C_Chained_Bear.act`,
      String.raw`data\sprite\악세사리\남\남_C_Chained_Bear.spr`,
      String.raw`data\sprite\악세사리\여\여_C_Chained_Bear.spr`,
    ];
    for (const p of real) {
      const norm = normalizePath(p);
      expect(targets.some((t) => norm.includes(t)), p).toBe(true);
    }
  });

  it("does not match a different costume that shares a prefix", () => {
    // `_C_Fox_Ear` must not drag in `_C_Fox_Ear_Beret`: the headgear prefix ends
    // at the dot before the extension.
    const targets = spriteTargets("_C_Fox_Ear");
    const other = normalizePath(String.raw`data\sprite\악세사리\남\남_C_Fox_Ear_Beret.spr`);
    expect(targets.some((t) => other.includes(t))).toBe(false);
  });

  it("handles a Korean sprite name", () => {
    const got = spriteTargets("_붉은고양이귀케이프");
    expect(got[0]).toBe("/sprite/악세사리/남/남_붉은고양이귀케이프.");
    expect(got[2]).toBe("/sprite/이팩트/붉은고양이귀케이프/");
  });

  it("never asks for a robe folder, which is the other namespace", () => {
    expect(spriteTargets("_C_Chained_Bear").some((t) => t.includes("로브"))).toBe(false);
  });
});

describe("robeTargets", () => {
  it("takes both spellings the robe table carries, because both exist as folders", () => {
    expect(robeTargets("기린의날개", "KIRIN_WING")).toEqual([
      "/sprite/로브/기린의날개/",
      "/sprite/이팩트/기린의날개/",
      "/sprite/로브/kirin_wing/",
      "/sprite/이팩트/kirin_wing/",
    ]);
  });

  it("skips a spelling the table does not have", () => {
    expect(robeTargets("기린의날개", null)).toEqual([
      "/sprite/로브/기린의날개/",
      "/sprite/이팩트/기린의날개/",
    ]);
  });

  it("matches the real garment path from a live client", () => {
    const targets = robeTargets("C_Juncea_Wing");
    const real = normalizePath(String.raw`data\sprite\로브\C_Juncea_Wing\남byss_chaser_riding_남.act`);
    expect(targets.some((t) => real.includes(t))).toBe(true);
  });
});

describe("targetsFor", () => {
  it("dispatches on the namespace, so a view id is never looked up in the wrong tree", () => {
    expect(targetsFor("acc", "_C_Chained_Bear")).toEqual(spriteTargets("_C_Chained_Bear"));
    expect(targetsFor("robe", "기린의날개")).toEqual(robeTargets("기린의날개"));
  });
});

describe("ORIGINS", () => {
  it("gives every origin an index, a file store and an encoding", () => {
    for (const [id, o] of Object.entries(ORIGINS)) {
      expect(o.id, id).toBe(id);
      expect(o.index, id).toMatch(/^(https?|ftp):\/\//);
      expect(o.files, id).toMatch(/^(https?|ftp):\/\//);
      expect(o.files.endsWith("/"), `${id} file base must not end in /`).toBe(false);
      expect(o.encoding, id).toBeTruthy();
      expect(o.badge.length, id).toBeLessThanOrEqual(5);
    }
  });
});

describe("rgzProbeOrder", () => {
  // Opening a .rgz costs a full download, so the order decides the bandwidth
  // bill. Taken from the real twRO and jRO rgz ledgers.
  const rows = [
    { seq: "9433", file: "2026-11-17_Raghash_1794814779.rgz" },
    { seq: "9432", file: "2026-11-17_live_client_4597_4601_1794814779.rgz" },
    { seq: "9400", file: "2026-11-01_live_client_4500_4510_1790000000.rgz" },
    { seq: "9410", file: "2026-11-04aRagexe.rgz" },
    { seq: "9420", file: "2026-11-10_something_else.rgz" },
  ];

  it("tries client patches first and the executables and hash files last", () => {
    expect(rgzProbeOrder(rows).map((r) => r.file)).toEqual([
      "2026-11-17_live_client_4597_4601_1794814779.rgz",
      "2026-11-01_live_client_4500_4510_1790000000.rgz",
      "2026-11-10_something_else.rgz",
      "2026-11-17_Raghash_1794814779.rgz",
      "2026-11-04aRagexe.rgz",
    ]);
  });

  it("keeps the newest first inside a group and does not mutate the input", () => {
    const before = rows.map((r) => r.file);
    const client = rgzProbeOrder(rows).filter((r) => r.file.includes("live_client"));
    expect(client.map((r) => Number(r.seq))).toEqual([9432, 9400]);
    expect(rows.map((r) => r.file)).toEqual(before);
  });
});

describe("legacyNameCoverage", () => {
  // This rule decides whether to download tens of MB of .rgz from somebody
  // else's CDN, so each real origin's shape gets a case.
  const views = [
    { view: 1, sprite: "_a" },
    { view: 2, sprite: "_b" },
    { view: 3, sprite: "_c" },
    { view: 4, sprite: "_d" },
  ];

  it("counts a view as named only when the item has a display name too", () => {
    const got = legacyNameCoverage({
      viewRows: views,
      legacyRes: new Map([
        [100, "a"],
        [200, "b"],
      ]),
      legacyNames: new Map([[100, "Chapéu"]]),
    });
    expect(got.named).toBe(1);
    expect(got.withSprite).toBe(4);
    expect(got.thin).toBe(true);
  });

  it("treats a resource table with no display table as naming nothing (twRO)", () => {
    const got = legacyNameCoverage({
      viewRows: views,
      legacyRes: new Map([
        [100, "a"],
        [200, "b"],
        [300, "c"],
        [400, "d"],
      ]),
      legacyNames: new Map(),
    });
    expect(got.ratio).toBe(0);
    expect(got.thin).toBe(true);
  });

  it("leaves a client alone when its own tables already explain it (jRO)", () => {
    const legacyRes = new Map([
      [100, "a"],
      [200, "b"],
      [300, "c"],
    ]);
    const legacyNames = new Map([
      [100, "um"],
      [200, "dois"],
      [300, "três"],
    ]);
    const got = legacyNameCoverage({ viewRows: views, legacyRes, legacyNames });
    expect(got.named).toBe(3);
    expect(got.thin).toBe(false);
  });

  it("ignores views with no sprite, and a deliberately blank one", () => {
    const got = legacyNameCoverage({
      viewRows: [{ view: 1, sprite: "_a" }, { view: 2, sprite: "" }, { view: 3, sprite: null }],
      legacyRes: new Map([[100, "a"]]),
      legacyNames: new Map([[100, "um"]]),
    });
    expect(got.withSprite).toBe(1);
    expect(got.ratio).toBe(1);
    expect(got.thin).toBe(false);
  });

  it("matches case-insensitively, since the tables disagree on case", () => {
    const got = legacyNameCoverage({
      viewRows: [{ view: 1, sprite: "_C_Chained_Bear" }],
      legacyRes: new Map([[100, "c_chained_BEAR"]]),
      legacyNames: new Map([[100, "Urso"]]),
    });
    expect(got.named).toBe(1);
  });

  it("calls a client with no views at all thin, since only a probe can tell", () => {
    expect(
      legacyNameCoverage({ viewRows: [], legacyRes: new Map(), legacyNames: new Map() }).thin,
    ).toBe(true);
  });
});

describe("targetsOf", () => {
  it("tags the costume's own files core and the aura folder effect", () => {
    const got = targetsOf({ kind: "acc", view: 8, sprite: "_C_Chained_Bear" });
    expect(got.filter((t) => t.tier === "core").map((t) => t.prefix)).toEqual([
      "/sprite/악세사리/남/남_c_chained_bear.",
      "/sprite/악세사리/여/여_c_chained_bear.",
    ]);
    expect(got.filter((t) => t.tier === "effect").map((t) => t.prefix)).toEqual([
      "/sprite/이팩트/c_chained_bear/",
    ]);
    // Every target carries the row's key, so a hit can be credited to a view.
    expect(new Set(got.map((t) => t.key))).toEqual(new Set(["acc:8"]));
  });

  it("calls a garment's own folder core, keeping the effect folder separate", () => {
    const got = targetsOf({ kind: "robe", view: 8, sprite: "C_S_Thanatos_Wing" });
    expect(got.filter((t) => t.tier === "core").map((t) => t.prefix)).toEqual([
      "/sprite/로브/c_s_thanatos_wing/",
    ]);
    expect(got.filter((t) => t.tier === "effect")).toHaveLength(1);
  });
});

describe("rowKey", () => {
  it("separates the two namespaces that share small numbers", () => {
    // LATAM view 8 is a surgical mask as headgear and Rudra's wings as garment.
    expect(rowKey({ kind: "acc", view: "8" })).toBe("acc:8");
    expect(rowKey({ kind: "robe", view: "8" })).toBe("robe:8");
  });
});

describe("coverPlan", () => {
  // Two origins, one view in both: a plan must not fetch it twice.
  const hit = (key, archive, seq, uncompSize = 100, tier = "core") => ({
    key,
    archive,
    seq,
    uncompSize,
    tier,
    path: `p/${key}/${archive}`,
  });
  // A headgear fixture has to carry both sexes, because `originCanDraw` drops
  // an origin that cannot render the view. That is the planner's rule, not the
  // test's: paths that cannot draw are paths no plan should fetch.
  const pair = (key, archive, seq, uncompSize = 50) =>
    [SEX_M, SEX_F].map((sex) => [accPath(sex, key), hit(key, archive, seq, uncompSize)]);

  it("fetches a view shared by two origins from only one of them", () => {
    const byOrigin = new Map([
      ["twro", new Map(pair("acc:1", "t1.gpf", 10))],
      ["jro", new Map(pair("acc:1", "j1.gpf", 20))],
    ]);
    const { steps, unreachable } = coverPlan(byOrigin, ["acc:1"]);
    expect(steps).toHaveLength(1);
    expect(unreachable).toEqual([]);
  });

  it("takes the archive that supplies most first, then the rest", () => {
    const byOrigin = new Map([
      [
        "twro",
        new Map([
          ["robe/a/1.spr", hit("robe:1", "big.gpf", 10)],
          ["robe/b/1.spr", hit("robe:2", "big.gpf", 10)],
          ["robe/a/2.spr", hit("robe:1", "small.gpf", 11)],
        ]),
      ],
    ]);
    const { steps } = coverPlan(byOrigin, ["robe:1", "robe:2"]);
    // big.gpf supplies two files to small.gpf's one, so the greedy takes it
    // first — but small.gpf still holds a file of acc:1, so it is not dropped.
    expect(steps.map((s) => s.archive)).toEqual(["big.gpf", "small.gpf"]);
  });

  // The bug stage 5 caught: Gravity ships a garment's .act files in one patch
  // and its .spr in another, and counting coverage per view stopped at the
  // first. 29 of 665 costumes arrived as animation data with no artwork.
  it("fetches the rest of a costume whose files are split across patches", () => {
    const byOrigin = new Map([
      [
        "iro",
        new Map([
          ["robe/x/x.act", hit("robe:1", "acts.gpf", 10)],
          ["robe/x/x.spr", hit("robe:1", "sprites.gpf", 11)],
        ]),
      ],
    ]);
    const { steps, unreachable } = coverPlan(byOrigin, ["robe:1"]);
    expect(unreachable).toEqual([]);
    expect(steps.flatMap((s) => s.files.map((f) => f.norm)).sort()).toEqual([
      "robe/x/x.act",
      "robe/x/x.spr",
    ]);
  });

  // The planner picks an origin by how many files it supplies, which is not the
  // same as supplying the right ones: on the first path-covered plan robe:132
  // went to iRO, which has no .spr for it, while twRO has 343.
  it("skips an origin that carries a garment's .act files but no artwork", () => {
    const byOrigin = new Map([
      [
        "iro",
        new Map([
          ["robe/x/1.act", hit("robe:1", "iro.gpf", 10)],
          ["robe/x/2.act", hit("robe:1", "iro.gpf", 10)],
          ["robe/x/3.act", hit("robe:1", "iro.gpf", 10)],
        ]),
      ],
      ["twro", new Map([["robe/x/1.spr", hit("robe:1", "tw.gpf", 5)]])],
    ]);
    const { steps, unreachable } = coverPlan(byOrigin, ["robe:1"]);
    expect(unreachable).toEqual([]);
    // iRO offers three files to twRO's one and still loses.
    expect(steps.map((s) => s.originId)).toEqual(["twro"]);
  });

  it("skips an origin that has only one sex of a headgear", () => {
    const byOrigin = new Map([
      ["krozero", new Map([[accPath(SEX_M), hit("acc:1", "kz.gpf", 10)]])],
      [
        "twro",
        new Map([
          [accPath(SEX_M), hit("acc:1", "tw.gpf", 5)],
          [accPath(SEX_F), hit("acc:1", "tw.gpf", 5)],
        ]),
      ],
    ]);
    const { steps } = coverPlan(byOrigin, ["acc:1"]);
    expect(steps.map((s) => s.originId)).toEqual(["twro"]);
  });

  it("calls a view unreachable when no origin can render it", () => {
    // acc:156 is real: only kRO Zero has it, and only the male sprite. Fetching
    // it would cost bytes and still yield a costume the catalogue throws away.
    const byOrigin = new Map([
      [
        "krozero",
        new Map([[accPath(SEX_M), hit("acc:1", "kz.gpf", 10)]]),
      ],
    ]);
    const { steps, unreachable } = coverPlan(byOrigin, ["acc:1"]);
    expect(steps).toEqual([]);
    expect(unreachable).toEqual(["acc:1"]);
  });

  // One costume, one origin: 282 .act files differ in content between origins,
  // so a garment half from twRO and half from iRO animates against the wrong
  // offsets. The greedy may pick either origin, but not both.
  it("never assembles one costume from two origins", () => {
    const byOrigin = new Map([
      [
        "twro",
        new Map([
          ["robe/x/x.act", hit("robe:1", "tw.gpf", 10)],
          ["robe/x/x.spr", hit("robe:1", "tw.gpf", 10)],
        ]),
      ],
      ["iro", new Map([["robe/x/x.spr", hit("robe:1", "iro.gpf", 99)]])],
    ]);
    const { steps } = coverPlan(byOrigin, ["robe:1"]);
    expect([...new Set(steps.map((s) => s.originId))]).toEqual(["twro"]);
  });

  it("takes every wanted file an archive carries, not one per view", () => {
    // A headgear needs both sexes; dropping one leaves a half-rendered costume.
    const byOrigin = new Map([
      ["twro", new Map(pair("acc:1", "p.gpf", 10))],
    ]);
    const { steps } = coverPlan(byOrigin, ["acc:1"]);
    expect(steps[0].files).toHaveLength(2);
  });

  it("reports views no origin can supply instead of looping forever", () => {
    const byOrigin = new Map([["twro", new Map(pair("acc:1", "p.gpf", 10))]]);
    const { steps, unreachable } = coverPlan(byOrigin, ["acc:1", "acc:999"]);
    expect(steps).toHaveLength(1);
    expect(unreachable).toEqual(["acc:999"]);
  });

  it("orders the plan oldest patch first, so a later one overwrites it", () => {
    const byOrigin = new Map([
      ["twro", new Map([...pair("acc:1", "new.gpf", 90), ...pair("acc:2", "old.gpf", 10)])],
    ]);
    const { steps } = coverPlan(byOrigin, ["acc:1", "acc:2"]);
    expect(steps.map((s) => s.archive)).toEqual(["old.gpf", "new.gpf"]);
  });

  it("counts only the tiers it was asked for", () => {
    const byOrigin = new Map([
      [
        "twro",
        new Map([
          ...pair("acc:1", "p.gpf", 10, 50),
          ["data/sprite/이팸트/x/a.tga", hit("acc:1", "p.gpf", 10, 9000, "effect")],
        ]),
      ],
    ]);
    const core = coverPlan(byOrigin, ["acc:1"], { tiers: ["core"] });
    expect(planStats(core, ["acc:1"]).bytes).toBe(100);
    const both = coverPlan(byOrigin, ["acc:1"], { tiers: ["core", "effect"] });
    expect(planStats(both, ["acc:1"]).bytes).toBe(9100);
  });
});

describe("planStats", () => {
  it("splits bytes by tier, which is the number the fetch decision turns on", () => {
    const steps = [
      {
        originId: "twro",
        archive: "p.gpf",
        seq: 1,
        files: [
          { key: "acc:1", tier: "core", uncompSize: 200 },
          { key: "acc:1", tier: "effect", uncompSize: 5000 },
        ],
      },
    ];
    const got = planStats({ steps, unreachable: ["acc:2"] }, ["acc:1", "acc:2"]);
    expect(got).toMatchObject({
      wanted: 2,
      covered: 1,
      unreachable: 1,
      archives: 1,
      files: 2,
      bytes: 5200,
      perOrigin: { twro: 1 },
      perTier: { core: 200, effect: 5000 },
    });
  });
});

describe("coalesceSpans", () => {
  it("merges spans close enough that the gap is cheaper than a round trip", () => {
    const got = coalesceSpans(
      [
        { start: 100, length: 50 },
        { start: 200, length: 50 },
      ],
      { gap: 100 },
    );
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ start: 100, end: 249 });
    expect(got[0].spans).toHaveLength(2);
  });

  it("keeps spans apart when the gap is wider than the window", () => {
    const got = coalesceSpans(
      [
        { start: 0, length: 10 },
        { start: 1_000_000, length: 10 },
      ],
      { gap: 1024 },
    );
    expect(got.map((r) => [r.start, r.end])).toEqual([
      [0, 9],
      [1_000_000, 1_000_009],
    ]);
  });

  it("sorts before merging, since a file table is not in offset order", () => {
    const got = coalesceSpans(
      [
        { start: 300, length: 10 },
        { start: 100, length: 10 },
        { start: 200, length: 10 },
      ],
      { gap: 1000 },
    );
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ start: 100, end: 309 });
  });

  it("merges spans that abut or overlap, and keeps the furthest end", () => {
    // A zero gap must still merge: `end + 1` is the first uncovered byte.
    expect(coalesceSpans([{ start: 0, length: 10 }, { start: 10, length: 10 }], { gap: 0 })).toHaveLength(1);
    // A span swallowed by a longer one must not shrink the range.
    const got = coalesceSpans([{ start: 0, length: 100 }, { start: 10, length: 5 }], { gap: 0 });
    expect(got[0].end).toBe(99);
  });

  it("drops the zero-length spans a directory entry produces", () => {
    const got = coalesceSpans([{ start: 50, length: 0 }, { start: 100, length: 10 }], { gap: 0 });
    expect(got).toHaveLength(1);
    expect(got[0].start).toBe(100);
  });

  it("defaults to a window where the gap is smaller than a client patch", () => {
    expect(COALESCE_GAP).toBe(262144);
  });
});

describe("rangeCost", () => {
  it("separates the bytes wanted from the bytes read to avoid a round trip", () => {
    const ranges = coalesceSpans(
      [
        { start: 0, length: 100 },
        { start: 1000, length: 100 },
      ],
      { gap: 2000 },
    );
    expect(rangeCost(ranges)).toEqual({
      requests: 1,
      requested: 1100,
      useful: 200,
      waste: 900,
    });
  });
});

describe("parseSlotValue", () => {
  // Every string below was collected from a real iteminfo_new.lub on disk.
  it("reads the three Chinese head positions", () => {
    expect(parseSlotValue("頭上")).toEqual(["top"]);
    expect(parseSlotValue("頭中")).toEqual(["mid"]);
    expect(parseSlotValue("頭下")).toEqual(["low"]);
  });

  it("reads 披肩 as a garment, not a headgear", () => {
    expect(parseSlotValue("披肩")).toEqual(["garment"]);
  });

  it("reads the joined Chinese forms, whatever separator they use", () => {
    expect(parseSlotValue("頭上/中/下")).toEqual(["top", "mid", "low"]);
    expect(parseSlotValue("頭上、中、下")).toEqual(["top", "mid", "low"]);
    expect(parseSlotValue("頭上中下")).toEqual(["top", "mid", "low"]);
    expect(parseSlotValue("頭上/中")).toEqual(["top", "mid"]);
    expect(parseSlotValue("頭中/下")).toEqual(["mid", "low"]);
    expect(parseSlotValue("頭上、頭中、頭下")).toEqual(["top", "mid", "low"]);
  });

  it("cuts the next field off when it runs into the value with no space", () => {
    // twRO ships this: the weight field collides with the position value.
    expect(parseSlotValue("頭上重量: 0")).toEqual(["top"]);
    expect(parseSlotValue("頭上/中重量：0")).toEqual(["top", "mid"]);
  });

  it("reads the Portuguese forms, joined by 'e' or a comma", () => {
    expect(parseSlotValue("Topo")).toEqual(["top"]);
    expect(parseSlotValue("Meio")).toEqual(["mid"]);
    expect(parseSlotValue("Baixo")).toEqual(["low"]);
    expect(parseSlotValue("Capa")).toEqual(["garment"]);
    expect(parseSlotValue("Topo e Meio")).toEqual(["top", "mid"]);
    expect(parseSlotValue("Topo, Meio e Baixo")).toEqual(["top", "mid", "low"]);
    expect(parseSlotValue("Meio e baixo")).toEqual(["mid", "low"]);
    expect(parseSlotValue("Superior")).toEqual(["top"]);
  });

  it("returns the slots in priority order however they were written", () => {
    expect(parseSlotValue("Baixo e Meio")).toEqual(["mid", "low"]);
    expect(parseSlotValue("頭下/上")).toEqual(["top", "low"]);
  });

  it("says nothing rather than guessing when the value names no position", () => {
    expect(parseSlotValue("全職業")).toEqual([]);
    expect(parseSlotValue("")).toEqual([]);
    expect(parseSlotValue(undefined)).toEqual([]);
  });

  it("does not read a bare 上 outside a 頭 value as a headgear slot", () => {
    // "位置 : 上" never appears; requiring 頭 keeps an unrelated line from
    // claiming a slot just because it contains the character.
    expect(parseSlotValue("上")).toEqual([]);
  });
});

describe("parseSlotsFromLines", () => {
  it("finds the labelled line among a description's other lines", () => {
    const got = parseSlotsFromLines([
      "在頭上閃閃發光的小型聖誕樹。",
      "系列 : 服飾裝備 防禦 :  0",
      "位置 : 頭上 重量 : 0",
      "裝備 : 全職業",
    ]);
    expect(got).toEqual(["top"]);
  });

  it("strips the colour codes that sit inside the value", () => {
    expect(parseSlotsFromLines(["Equipa em: ^777777Topo e Meio^000000"])).toEqual(["top", "mid"]);
  });

  it("accepts the newer LATAM label too", () => {
    expect(parseSlotsFromLines(["Posição: Topo"])).toEqual(["top"]);
  });

  it("keeps looking when a labelled line names no position", () => {
    expect(parseSlotsFromLines(["位置 : 全職業", "位置 : 頭下"])).toEqual(["low"]);
  });

  it("returns nothing when no line carries the label", () => {
    expect(parseSlotsFromLines(["uma descrição qualquer", "系列 : 服飾裝備"])).toEqual([]);
  });
});

describe("kindFromSlots", () => {
  it("calls a garment-only item a garment and everything else a headgear", () => {
    expect(kindFromSlots(["garment"])).toBe("robe");
    expect(kindFromSlots(["top"])).toBe("acc");
    expect(kindFromSlots(["top", "mid", "low"])).toBe("acc");
  });

  it("gives no namespace when no slot is known", () => {
    expect(kindFromSlots([])).toBe(null);
  });
});

describe("slotRank / bestSlot", () => {
  it("ranks headgear before garments, top before lower", () => {
    expect(SLOT_PRIORITY).toEqual(["top", "mid", "low", "garment"]);
    expect([...SLOT_PRIORITY].reverse().sort((a, b) => slotRank(a) - slotRank(b))).toEqual(
      SLOT_PRIORITY,
    );
  });

  it("sorts an unknown slot after every known one", () => {
    expect(slotRank("nonsense")).toBeGreaterThan(slotRank("garment"));
  });

  it("takes the most wanted slot of a multi-slot costume", () => {
    expect(bestSlot(["low", "top"])).toBe("top");
    expect(bestSlot(["garment"])).toBe("garment");
    expect(bestSlot([])).toBe(null);
    expect(bestSlot(undefined)).toBe(null);
  });
});

describe("slot ordering of a plan", () => {
  const hit = (key, archive, seq) => ({
    key,
    archive,
    seq,
    uncompSize: 10,
    tier: "core",
    path: `p/${key}`,
  });
  const pair = (key, archive, seq) =>
    [SEX_M, SEX_F].map((sex) => [accPath(sex, key), hit(key, archive, seq)]);

  it("ranks a step by the most wanted slot it covers", () => {
    const step = { files: [hit("acc:1", "p.gpf", 1), hit("acc:2", "p.gpf", 1)] };
    const slotOf = new Map([
      ["acc:1", "low"],
      ["acc:2", "top"],
    ]);
    expect(bestSlotOfStep(step, slotOf)).toBe("top");
  });

  it("gives a step no rank when none of its views has a known slot", () => {
    const step = { files: [hit("acc:9", "p.gpf", 1)] };
    expect(bestSlotOfStep(step, new Map())).toBe(null);
  });

  it("fetches headgear before garments when a slot index is given", () => {
    const byOrigin = new Map([
      [
        "twro",
        new Map([
          ["data/sprite/로브/capa/1.spr", hit("robe:1", "capes.gpf", 10)],
          ...pair("acc:1", "hats.gpf", 99),
        ]),
      ],
    ]);
    const slotOf = new Map([
      ["robe:1", "garment"],
      ["acc:1", "top"],
    ]);
    // Without the index, patch order wins and the older cape patch comes first.
    expect(coverPlan(byOrigin, ["acc:1", "robe:1"]).steps.map((s) => s.archive)).toEqual([
      "capes.gpf",
      "hats.gpf",
    ]);
    // With it, the hats come first although their patch is newer.
    expect(
      coverPlan(byOrigin, ["acc:1", "robe:1"], { slotOf }).steps.map((s) => s.archive),
    ).toEqual(["hats.gpf", "capes.gpf"]);
  });

  it("falls back to patch order between steps of the same slot", () => {
    const byOrigin = new Map([
      ["twro", new Map([...pair("acc:1", "new.gpf", 90), ...pair("acc:2", "old.gpf", 10)])],
    ]);
    const slotOf = new Map([
      ["acc:1", "top"],
      ["acc:2", "top"],
    ]);
    expect(
      coverPlan(byOrigin, ["acc:1", "acc:2"], { slotOf }).steps.map((s) => s.archive),
    ).toEqual(["old.gpf", "new.gpf"]);
  });
});

describe("fileEntries", () => {
  // GRF names are Windows-style; building them keeps a literal backslash out
  // of the source, where it would read as an escape.
  const BS = String.fromCharCode(92);
  const name = (...parts) => ["data", "sprite", "로부", "c_cape", ...parts].join(BS);

  it("drops the directory entries a GRF table lists beside its files", () => {
    // The real shape: a garment folder ships 남/여 as directories and the
    // sprites under them as files. Writing the directories as empty files is
    // what made the first twRO fetch die with EEXIST.
    const entries = [
      { filename: name("남"), flags: 0x00 },
      { filename: name("남", "x.act"), flags: 0x01 },
      { filename: name("여"), flags: 0x02 },
    ];
    expect(fileEntries(entries).map((e) => e.filename)).toEqual([name("남", "x.act")]);
  });

  it("keeps an encrypted file, whose flags carry the file bit plus more", () => {
    expect(fileEntries([{ flags: 0x01 | 0x02 }, { flags: 0x01 | 0x04 }])).toHaveLength(2);
  });

  it("drops the v0x300 entries whose flags carry 0x80 and no file bit", () => {
    expect(fileEntries([{ flags: 0x80 }])).toEqual([]);
  });
});

describe("blockedFrom", () => {
  // The real ledger shapes: jRO has 2,639 ok / 733 rgz / 68 blocked, kRO also
  // carries an "unsupported GRF version" row.
  const rows = [
    { file: "a.gpf", status: "ok", note: "" },
    { file: "b.gsf", status: "blocked", note: "v0x300 payloads do not extract yet" },
    { file: "c.rgz", status: "rgz", note: "no file table" },
    { file: "d.grf", status: "blocked", note: "unsupported GRF version 0x201" },
  ];

  it("names only the archives that could not be read", () => {
    expect(blockedFrom(rows)).toEqual(new Set(["b.gsf", "d.grf"]));
  });

  it("does not treat a tableless rgz as blocked — it is simply not in the index", () => {
    expect(blockedFrom(rows).has("c.rgz")).toBe(false);
  });

  it("is empty for a ledger with nothing blocked", () => {
    expect(blockedFrom([{ file: "a.gpf", status: "ok" }])).toEqual(new Set());
  });
});

describe("originCanDraw", () => {
  const sex = (s) => `data/sprite/악세사리/${s}/${s}chapeu.spr`;

  it("needs both sexes for a headgear", () => {
    expect(originCanDraw("acc", [sex("남"), sex("여")])).toBe(true);
    expect(originCanDraw("acc", [sex("남")])).toBe(false);
    expect(originCanDraw("acc", [sex("여")])).toBe(false);
  });

  it("reads the sex from the file name, not from the folder", () => {
    // The male sprite copied into the female folder is still the male sprite:
    // the client resolves the file name.
    const maleInFemaleFolder = `data/sprite/악세사리/${SEX_F}/${SEX_M}chapeu.spr`;
    expect(originCanDraw("acc", [sex(SEX_M), maleInFemaleFolder])).toBe(false);
    expect(originCanDraw("acc", [sex(SEX_M), sex(SEX_F)])).toBe(true);
  });

  it("needs one .spr anywhere in a garment folder, and .act alone is not it", () => {
    expect(originCanDraw("robe", ["robe/x/a.act", "robe/x/deep/b.spr"])).toBe(true);
    expect(originCanDraw("robe", ["robe/x/a.act", "robe/x/b.act"])).toBe(false);
  });

  it("is false for nothing at all", () => {
    expect(originCanDraw("robe", [])).toBe(false);
  });
});

describe("planByCostume", () => {
  it("groups a view's files and keeps the origin that supplies them", () => {
    const got = planByCostume([
      { kind: "robe", view: "7", origin: "iro", path: "data/sprite/x.spr" },
      { kind: "robe", view: "7", origin: "iro", path: "data/sprite/x.act" },
      { kind: "acc", view: "7", origin: "twro", path: "data/sprite/h.spr" },
    ]);
    // Same view id in two namespaces is two costumes, not one.
    expect([...got.keys()]).toEqual(["robe:7", "acc:7"]);
    expect(got.get("robe:7")).toEqual({
      kind: "robe",
      view: 7,
      origin: "iro",
      files: ["data/sprite/x.spr", "data/sprite/x.act"],
    });
  });
});

describe("slotsByCostume", () => {
  it("splits the slot column and leaves an unknown slot empty", () => {
    const got = slotsByCostume([
      { kind: "acc", view: "1", slots: "top,mid" },
      { kind: "acc", view: "2", slots: "" },
    ]);
    expect(got.get("acc:1")).toEqual(["top", "mid"]);
    expect(got.get("acc:2")).toEqual([]);
  });
});

describe("costumeDraws", () => {
  const probe = {
    robeHasSprite: (origin, sprite) => sprite === "capa_boa",
    headgearPair: (origin, sprite) => sprite === "chapeu_bom",
  };

  it("asks the right question per namespace", () => {
    expect(costumeDraws({ kind: "robe" }, "capa_boa", probe)).toBe(true);
    expect(costumeDraws({ kind: "robe" }, "chapeu_bom", probe)).toBe(false);
    expect(costumeDraws({ kind: "acc" }, "chapeu_bom", probe)).toBe(true);
  });

  it("is false without a sprite name, since nothing can resolve it", () => {
    expect(costumeDraws({ kind: "acc" }, "", probe)).toBe(false);
  });
});

describe("treeProbe", () => {
  // A fake tree below the garment root, in the shape the mirror has. The probe
  // builds absolute paths through `paths.mirrorDir`, so the fake keys on what
  // follows the Korean garment folder rather than on the whole path.
  const ROOT = "로브/";
  const tree = {
    capa_boa: ["frames"],
    "capa_boa/frames": ["a.spr", "a.act"],
    capa_vazia: ["b.act"],
  };
  const under = (dir) => {
    const rel = dir.split(sep).join("/");
    const i = rel.indexOf(ROOT);
    return i === -1 ? rel : rel.slice(i + ROOT.length);
  };
  const probe = treeProbe({
    readdirSync: (dir) => {
      const entries = tree[under(dir)];
      if (!entries) throw new Error("ENOENT");
      return entries.map((name) => ({
        name,
        isDirectory: () => Boolean(tree[`${under(dir)}/${name}`]),
      }));
    },
    existsSync: (p) => /[남여]chapeu_bom[.]spr$|남meio[.]spr$/.test(p),
  });

  it("finds a .spr nested below the garment folder", () => {
    expect(probe.robeHasSprite("iro", "capa_boa")).toBe(true);
  });

  it("matches the folder case-insensitively, as the mirror is written", () => {
    expect(probe.robeHasSprite("iro", "CAPA_BOA")).toBe(true);
  });

  it("drops the leading underscore a sprite name may carry", () => {
    expect(probe.robeHasSprite("iro", "_capa_boa")).toBe(true);
  });

  it("is false for a folder with only .act files, and for one that is absent", () => {
    // The 27 garments the old plan left as animation data with no artwork.
    expect(probe.robeHasSprite("iro", "capa_vazia")).toBe(false);
    expect(probe.robeHasSprite("iro", "nao_existe")).toBe(false);
  });

  it("requires both sexes for a headgear", () => {
    expect(probe.headgearPair("iro", "chapeu_bom")).toBe(true);
    // Only the male sprite exists: a costume half the players cannot see is
    // not listed. Two kRO Zero hats arrived exactly like this.
    expect(probe.headgearPair("iro", "meio")).toBe(false);
  });
});

describe("originsFromPaths", () => {
  const costumes = [
    { kind: "acc", view: 1, sprite: "_chapeu" },
    { kind: "robe", view: 2, sprite: "capa" },
    { kind: "acc", view: 3, sprite: "" },
  ];
  const acc = (sex, name) => `data\\sprite\\악세사리\\${sex}\\${sex}${name}`;
  const index = new Map([
    // Ships both sexes of the hat and a sprite inside the garment's folder.
    [
      "iro",
      [acc("남", "_chapeu.spr"), acc("여", "_chapeu.spr"), "data\\sprite\\로브\\capa\\남_capa.spr"],
    ],
    // Only the male hat, and only animation data for the garment.
    ["twro", [acc("남", "_Chapeu.SPR"), "data\\sprite\\로브\\capa\\남_capa.act"]],
    // Has the garment, not the hat.
    ["jro", ["data\\sprite\\로브\\capa\\여_capa.spr"]],
  ]);
  const holders = originsFromPaths(costumes, index);

  it("credits a server only when it ships both sexes of a headgear", () => {
    // twRO ships the male sprite alone -- the same rule costumeDraws applies,
    // because "has it" has to mean "could draw it".
    expect(holders.get("acc:1")).toEqual(["iro"]);
  });

  it("credits a garment to every server with a sprite in its folder", () => {
    // twRO's folder holds only an .act, which draws nothing.
    expect(holders.get("robe:2")).toEqual(["iro", "jro"]);
  });

  it("matches regardless of the case and slashes an archive used", () => {
    // Paths inside a GRF are Windows-style and inconsistently cased; iRO's
    // rows above are lowercase and twRO's are not.
    expect(originsFromPaths([costumes[0]], new Map([["twro", [acc("남", "_CHAPEU.spr"), acc("여", "_chapeu.SPR")]]])).get("acc:1")).toEqual(["twro"]);
  });

  it("credits nothing to a costume with no sprite name", () => {
    expect(holders.get("acc:3")).toEqual([]);
  });
});

describe("buildCatalogue", () => {
  const plan = [
    { kind: "acc", view: "1", origin: "twro", path: "a.spr" },
    { kind: "acc", view: "1", origin: "twro", path: "b.spr" },
    { kind: "acc", view: "2", origin: "iro", path: "c.spr" },
    { kind: "acc", view: "3", origin: "iro", path: "d.spr" },
  ];
  const shortlist = [
    { kind: "acc", view: "1", sprite: "bom", name: "Chapéu Bom", nameOrigin: "latam", aegis: "C_Good" },
    { kind: "acc", view: "2", sprite: "quebrado", name: "", nameOrigin: "", aegis: "" },
  ];
  const slots = [{ kind: "acc", view: "1", slots: "top" }];
  const probe = { headgearPair: (o, sprite) => sprite === "bom", robeHasSprite: () => false };
  const built = buildCatalogue({
    plan,
    shortlist,
    slots,
    probe,
    present: (origin, path) => path !== "b.spr",
  });

  it("lists only the costumes that draw", () => {
    expect(built.costumes).toHaveLength(1);
    expect(built.costumes[0]).toEqual({
      kind: "acc",
      view: 1,
      sprite: "bom",
      origin: "twro",
      // No path index was given, so the only server known to have it is the
      // tree it came from.
      origins: ["twro"],
      name: "Chapéu Bom",
      nameOrigin: "latam",
      aegis: "C_Good",
      slots: ["top"],
      // What is on disk, which after --prune-robes is not what the plan listed.
      files: 1,
    });
  });

  it("counts the two reasons a costume is left out separately", () => {
    expect(built.stats.skipped).toEqual({ incomplete: 1, unknownToShortlist: 1 });
  });

  it("totals by origin and by slot, with an unknown slot as ?", () => {
    expect(built.stats).toMatchObject({
      total: 1,
      named: 1,
      withAegis: 1,
      perOrigin: { twro: 1 },
      perSlot: { top: 1 },
    });
  });

  it("marks a costume with no slot line as ? rather than dropping it", () => {
    const other = buildCatalogue({
      plan: [{ kind: "acc", view: "1", origin: "twro", path: "a.spr" }],
      shortlist,
      slots: [],
      probe,
      present: () => true,
    });
    expect(other.costumes[0].slots).toEqual([]);
    expect(other.stats.perSlot).toEqual({ "?": 1 });
  });
});

describe("catalogueDocument", () => {
  const doc = catalogueDocument(
    {
      costumes: [
        { kind: "acc", view: 1, sprite: "bom", origin: "twro", slots: ["top"] },
        { kind: "robe", view: 2, sprite: "capa", origin: "iro", slots: [] },
      ],
      stats: { total: 2, named: 1, withAegis: 0, perOrigin: { twro: 1, iro: 1 }, perSlot: {} },
    },
    { generatedAt: "2026-11-18" },
  );

  it("names every origin it used, so a consumer can label a badge", () => {
    expect(Object.keys(doc.origins).sort()).toEqual(["iro", "twro"]);
    expect(doc.origins.twro.label).toBe(ORIGINS.twro.label);
    expect(doc.origins.twro.assets).toBe("mirror/twro");
  });

  it("carries the sprite name, not just the view id", () => {
    // A foreign view id may be absent from the LATAM table, or mean something
    // else there, so the name is what a consumer resolves by.
    expect(doc.costumes.map((c) => c.sprite)).toEqual(["bom", "capa"]);
    expect(doc.version).toBe(1);
    expect(doc.generatedAt).toBe("2026-11-18");
  });
});
