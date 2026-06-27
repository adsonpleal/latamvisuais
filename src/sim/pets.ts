// The pet (mascote) catalog for the map simulator. Each pet is a tameable or
// evolved monster from the LATAM server's pet list (browiki "Mascotes"). Rendering
// one reuses the ragassets gateway unchanged: a monster sprite is just
// `job=<mobId>` on the same /image endpoint the character uses — no hair, gear or
// gender params. Display names are the monsters' pt-BR names from
// ragassets/mobs.json (resolved from each pet egg via rAthena's pet_db). The
// selected pet is part of the build (state.pet), so it saves to slots and travels
// in the share URL like the mount.

import { RAGASSETS_BASE } from "../core/state";
import { APP_VERSION } from "../changelog";

export type Pet = { mob: number; egg: number; name: string; eggName: string };

/** The roster, sorted by display name. `mob` is the monster's render/mobs.json id,
 *  `name` its pt-BR monster name. `egg` is the pet-egg item id and `eggName` its
 *  in-game pt-BR item name, both for the wishlist — `eggName` is pulled from the
 *  client's iteminfo (the same source costume names use); regenerate it with
 *  `node tools/extract-pet-eggs.mjs`. */
export const PETS: Pet[] = [
  { mob: 1059, egg: 9193, name: "Abelha-Rainha", eggName: "Ovo de Abelha-Rainha" },
  { mob: 1894, egg: 9114, name: "Aguaring", eggName: "Ovo de Pouring" },
  { mob: 1275, egg: 9027, name: "Alice", eggName: "Ovo de Alice" },
  { mob: 1735, egg: 9119, name: "Alicel", eggName: "Ovo de Alicel" },
  { mob: 1736, egg: 9118, name: "Aliot", eggName: "Ovo de Aliot" },
  { mob: 1737, egg: 9120, name: "Aliza", eggName: "Ovo de Aliza" },
  { mob: 1301, egg: 9089, name: "Am Mut", eggName: "Ovo de Am Mut" },
  { mob: 1208, egg: 9037, name: "Andarilho", eggName: "Ovo de Andarilho" },
  { mob: 20420, egg: 9117, name: "Andarilho Poluto", eggName: "Ovo de Andarilho Poluto" },
  { mob: 1096, egg: 9088, name: "Angeling", eggName: "Ovo de Angeling" },
  { mob: 1495, egg: 9051, name: "Atirador de Pedras", eggName: "Ovo do Atirador de Pedras" },
  { mob: 20525, egg: 9130, name: "Bafinho Caótico", eggName: "Ovo de Bafinho Caótico" },
  { mob: 1039, egg: 9137, name: "Bafomé", eggName: "Ovo de Bafomé" },
  { mob: 1101, egg: 9024, name: "Bafomé Jr.", eggName: "Ovo de Bafomé Jr." },
  { mob: 2398, egg: 9062, name: "Bebê Poring", eggName: "Ovo de Bebê Poring" },
  { mob: 1167, egg: 9009, name: "Bebê Selvagem", eggName: "Ovo de Bebê Selvagem" },
  { mob: 3636, egg: 9090, name: "Bebê Ísis", eggName: "Ovo de Bebê Ísis" },
  { mob: 1188, egg: 9025, name: "Bongun", eggName: "Ovo de Bongun" },
  { mob: 1219, egg: 9132, name: "Cavaleiro do Abismo", eggName: "O Ovo do Cavaleiro do Abismo" },
  { mob: 20574, egg: 9133, name: "Cavaleiro Mutante", eggName: "Ovo de Cavaleiro Mutante" },
  { mob: 1214, egg: 9091, name: "Choco", eggName: "Ovo de Choco" },
  { mob: 1011, egg: 9006, name: "ChonChon", eggName: "Ovo de Chonchon" },
  { mob: 1042, egg: 9007, name: "Chonchon de Aço", eggName: "Ovo de Chonchon de Aço" },
  { mob: 1631, egg: 9030, name: "Chung E", eggName: "Ovo de Chung E" },
  { mob: 3670, egg: 9098, name: "Deletério", eggName: "Ovo de Deletério" },
  { mob: 1109, egg: 9023, name: "Deviruchi", eggName: "Ovo de Deviruchi" },
  { mob: 3669, egg: 9097, name: "Diabolik", eggName: "Ovo de Diabolik" },
  { mob: 1110, egg: 9019, name: "Dokebi", eggName: "Ovo de Dokebi" },
  { mob: 1113, egg: 9002, name: "Drops", eggName: "Ovo de Drops" },
  { mob: 1504, egg: 9049, name: "Dullahan", eggName: "Ovo de Dullahan" },
  { mob: 1014, egg: 9012, name: "Esporo", eggName: "Ovo de Esporo" },
  { mob: 1077, egg: 9013, name: "Esporo Venenoso", eggName: "Ovo de Esporo Venenoso" },
  { mob: 3971, egg: 9113, name: "Esqueleão", eggName: "Ovo de Esqueleão" },
  { mob: 1005, egg: 9138, name: "Farmiliar", eggName: "Ovo de Familiar" },
  { mob: 1107, egg: 9010, name: "Filhote de Lobo", eggName: "Ovo de Filhote de Lobo" },
  { mob: 1150, egg: 9112, name: "Flor do Luar", eggName: "Ovo de Flor do Luar" },
  { mob: 1159, egg: 9111, name: "Freeoni", eggName: "Ovo de Freeoni" },
  { mob: 1056, egg: 9015, name: "Fumacento", eggName: "Ovo de Fumacento" },
  { mob: 1586, egg: 9041, name: "Gato de Folha", eggName: "Ovo de Gato de Folha" },
  { mob: 1307, egg: 9096, name: "Gato de Nove Caudas", eggName: "Ovo de Gato de Nove Caudas" },
  { mob: 1270, egg: 9169, name: "Gerente", eggName: "Ovo de Gerente" },
  { mob: 1040, egg: 9053, name: "Golem", eggName: "Ovo de Golem" },
  { mob: 3023, egg: 9131, name: "Golem de Fogo", eggName: "Ovo de Golem de Fogo" },
  { mob: 1213, egg: 9087, name: "Grand Orc", eggName: "Ovo de Grand Orc" },
  { mob: 1369, egg: 9071, name: "Grand Peco", eggName: "Ovo de Grand Peco" },
  { mob: 1632, egg: 9100, name: "Gremlin", eggName: "Ovo de Gremlin" },
  { mob: 1023, egg: 9017, name: "Guerreiro Orc", eggName: "Ovo de Guerreiro Orc" },
  { mob: 1773, egg: 9105, name: "Hodremlin", eggName: "Ovo de Hodremlin" },
  { mob: 1302, egg: 9139, name: "Ilusão das Trevas", eggName: "Ovo de Ilusão das Trevas" },
  { mob: 1837, egg: 9056, name: "Imp", eggName: "Ovo de Imp" },
  { mob: 1374, egg: 9052, name: "Incubus", eggName: "Ovo de Incubus" },
  { mob: 1029, egg: 9021, name: "Isis", eggName: "Ovo de Ísis" },
  { mob: 1200, egg: 9026, name: "Jirtas", eggName: "Ovo de Jirtas" },
  { mob: 1734, egg: 9126, name: "Kiel-D-01", eggName: "Ovo de Kiel-D-01" },
  { mob: 20423, egg: 9115, name: "Lady Branca", eggName: "Ovo de Lady Branca" },
  { mob: 1106, egg: 9129, name: "Lobo do Deserto", eggName: "Ovo de Lobo do Deserto" },
  { mob: 1505, egg: 9042, name: "Loli Ruri", eggName: "Ovo de Loli Ruri" },
  { mob: 20940, egg: 9140, name: "Loli Ruri Azul", eggName: "Ovo da Loli Ruri Azul" },
  { mob: 1063, egg: 9004, name: "Lunático", eggName: "Ovo de Lunático" },
  { mob: 3496, egg: 9094, name: "Lunático Folhado", eggName: "Ovo de Lunático Folhado" },
  { mob: 1299, egg: 9046, name: "Líder Goblin", eggName: "Ovo de Líder Goblin" },
  { mob: 1513, egg: 9040, name: "Mao Guai", eggName: "Ovo de Mao Guai" },
  { mob: 1143, egg: 9043, name: "Marionete", eggName: "Ovo de Marionete" },
  { mob: 1090, egg: 9069, name: "Mastering", eggName: "Ovo de Mastering" },
  { mob: 1148, egg: 9050, name: "Medusa", eggName: "Ovo de Medusa" },
  { mob: 1058, egg: 9106, name: "Metaller", eggName: "Ovo de Metaller" },
  { mob: 20697, egg: 9124, name: "Mini Alpha", eggName: "Ovo de Mini Alpha" },
  { mob: 20696, egg: 9123, name: "Mini Beta", eggName: "Ovo de Mini Beta" },
  { mob: 1404, egg: 9048, name: "Miyabi Ningyo", eggName: "Ovo de Miyabi Ningyo" },
  { mob: 1035, egg: 9008, name: "Mosca Caçadora", eggName: "Ovo de Mosca Caçadora" },
  { mob: 1026, egg: 9018, name: "Munak", eggName: "Ovo de Munak" },
  { mob: 1041, egg: 9102, name: "Múmia", eggName: "Ovo de Múmia" },
  { mob: 1297, egg: 9107, name: "Múmia Anciã", eggName: "Ovo de Múmia Anciã" },
  { mob: 1416, egg: 9047, name: "Ninfa Perversa", eggName: "Ovo de Ninfa Perversa" },
  { mob: 1180, egg: 9095, name: "Nove Caudas", eggName: "Ovo de Nove Caudas" },
  { mob: 3495, egg: 9092, name: "Omeleting", eggName: "Ovo de Omeleting" },
  { mob: 1087, egg: 9121, name: "Orc Herói", eggName: "Ovo de Orc Herói" },
  { mob: 21089, egg: 9125, name: "Patinho", eggName: "Ovo de Patinho" },
  { mob: 1019, egg: 9014, name: "PecoPeco", eggName: "Ovo de PecoPeco" },
  { mob: 3260, egg: 9068, name: "Pequeno Cavalo Azul", eggName: "Ovo de Unicórnio" },
  { mob: 20373, egg: 9116, name: "Pesadelo Sinistro", eggName: "Ovo de Pesadelo Sinistro" },
  { mob: 1379, egg: 9054, name: "Pesadelo Sombrio", eggName: "Ovo de Pesadelo Sombrio" },
  { mob: 1768, egg: 9122, name: "Pesar Noturno", eggName: "Ovo de Pesar Noturno" },
  { mob: 1155, egg: 9022, name: "Petite", eggName: "Ovo de Petite" },
  { mob: 1049, egg: 9005, name: "Picky", eggName: "Ovo de Picky" },
  { mob: 1031, egg: 9003, name: "Poporing", eggName: "Ovo de Poporing" },
  { mob: 1002, egg: 9001, name: "Poring", eggName: "Ovo de Poring" },
  { mob: 3790, egg: 9109, name: "Quinding", eggName: "Ovo de Quinding" },
  { mob: 1052, egg: 9011, name: "Rocker", eggName: "Ovo de Rocker" },
  { mob: 1261, egg: 9141, name: "Rosa Selvagem", eggName: "Ovo de Rosa Selvagem" },
  { mob: 1782, egg: 9104, name: "Roween", eggName: "Ovo de Roween" },
  { mob: 1198, egg: 9128, name: "Sacerdote Maldito", eggName: "Ovo de Sacerdote Maldito" },
  { mob: 1010, egg: 9103, name: "Salgueiro", eggName: "Ovo de Salgueiro" },
  { mob: 1166, egg: 9070, name: "Selvagem", eggName: "Ovo de Selvagem" },
  { mob: 1272, egg: 9148, name: "Senhor das Trevas", eggName: "Ovo de Senhor das Trevas" },
  { mob: 1401, egg: 9044, name: "Shinobi", eggName: "Ovo de Shinobi" },
  { mob: 1170, egg: 9020, name: "Sohee", eggName: "Ovo de Sohee" },
  { mob: 1370, egg: 9055, name: "Succubus", eggName: "Ovo de Succubus" },
  { mob: 1179, egg: 9045, name: "Sussurro", eggName: "Ovo de Sussurro" },
  { mob: 2313, egg: 9059, name: "Tikbalang", eggName: "Ovo de Tikbalang" },
  { mob: 1622, egg: 9099, name: "Ursinho", eggName: "Ovo de Ursinho" },
  { mob: 2995, egg: 9108, name: "Ursinho Abominável", eggName: "Ovo de Ursinho Abominável" },
  { mob: 3074, egg: 9171, name: "Vigia do Tempo", eggName: "Ovo de Vigia do Tempo" },
  { mob: 1512, egg: 9093, name: "Yao Jun", eggName: "Ovo de Yao Jun" },
  { mob: 1057, egg: 9016, name: "Yoyo", eggName: "Ovo de Yoyo" },
  { mob: 1303, egg: 9192, name: "Zangão Gigante", eggName: "Ovo de Zangão Gigante" },
  { mob: 3731, egg: 9101, name: "Zumbichano", eggName: "Gaiola do Zumbichano" },
];

// Render canvas for the in-scene monster billboard. Like the character's, but
// sized for the largest pet sprite: measured against ragassets, a pet extends up
// to ~189px above / 46px below its ground origin and ~114px to each side
// (Cavaleiro Mutante is the extreme). The origin (anchorX, anchorY) is the ground
// contact point, so the billboard aligns it to the projected cell exactly like the
// character does.
export const PET_SPRITE = { w: 248, h: 256, anchorX: 124, anchorY: 200 } as const;
const PET_CANVAS = `${PET_SPRITE.w}x${PET_SPRITE.h}+${PET_SPRITE.anchorX}+${PET_SPRITE.anchorY}`;

// Pet animation types. zrenderer encodes action = type*8 + direction (same as the
// character); a follower only ever needs idle and walk.
export const PET_IDLE = 0;
export const PET_WALK = 1;

const CACHE_BUST = APP_VERSION;

/** One rendered monster frame for the billboard (fixed canvas so the ground origin
 *  is deterministic). We pass an explicit `frame` and cycle frames ourselves: a
 *  covered/hidden APNG has its animation paused by the browser. */
export function petSpriteUrl(mob: number, type: number, dir: number, frame: number): string {
  const p = new URLSearchParams();
  p.set("job", String(mob));
  p.set("action", String(type * 8 + dir));
  p.set("frame", String(frame));
  p.set("headdir", "0");
  p.set("canvas", PET_CANVAS);
  p.set("v", CACHE_BUST);
  return `${RAGASSETS_BASE}/image?${p.toString()}`;
}

/** Minimal animated render whose only job is to read a pose's composited frame
 *  count (the APNG acTL), mirroring core/state's frameCountProbeUrl — pinned south
 *  with a 2px canvas so the URL (and ragassets' cached render) stays stable. */
export function petFrameProbeUrl(mob: number, type: number): string {
  const p = new URLSearchParams();
  p.set("job", String(mob));
  p.set("action", String(type * 8));
  p.set("headdir", "0");
  p.set("canvas", "2x2+1+1");
  p.set("v", CACHE_BUST);
  return `${RAGASSETS_BASE}/image?${p.toString()}`;
}

/** Animated idle thumbnail for the picker grid. No `frame`, so the browser plays
 *  the APNG natively (the dialog is visible, not covered). The `canvas` param is
 *  omitted so ragassets auto-crops to the sprite's true bounds (the union of all
 *  frames) — every monster comes back tightly framed regardless of size, and the
 *  CSS tile scales it to fit (object-fit: contain) so nothing is ever clipped. */
export function petThumbUrl(mob: number): string {
  const p = new URLSearchParams();
  p.set("job", String(mob));
  p.set("action", String(PET_IDLE * 8));
  p.set("headdir", "0");
  p.set("v", CACHE_BUST);
  return `${RAGASSETS_BASE}/image?${p.toString()}`;
}
