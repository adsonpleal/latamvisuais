// Mount catalog — per class, the list of mounts the character can ride. A mount
// is NOT an extra sprite layer: in Ragnarok a mounted character is a distinct
// *mounted job sprite* with its own job id, which ragassets/zrenderer renders
// directly. So mounting just swaps the `job` parameter (see effectiveJob in
// state.ts); no costume/garment view is involved.
//
// Every class can ride the universal "Rédeas" mount — an archetype-themed
// creature (Poring/Alpaca/Raposa/Avestruz/Javali/Cérbero/Leão for 1st–3rd jobs,
// and the class's own *_RIDING sprite for 4th jobs). Some classes ALSO have a
// signature mount (Peco Peco, Dragão, Grifo, Worg, MECHA), so they offer
// two options.
//
// The job ids were derived from ragassets' authoritative id→sprite-name table
// (gateway/internal/render/resolve/data/job_names.txt) and verified to render on
// the live instance. Each list is ordered [Rédeas first, then signature]; a few
// classes (Espadachim/Justiceiro/Insurgente) only have the Peco sprite, and a
// couple (Mestre Estelar, Ceifador de Almas) have no mount sprite at all and are
// simply absent — the toggle is hidden for them.

export type MountNameKey =
  | "reins"
  | "peco"
  | "dragon"
  | "griffon"
  | "wolf"
  | "madogear";

export type Mount = { jobId: number; nameKey: MountNameKey };

const reins = (jobId: number): Mount => ({ jobId, nameKey: "reins" });

export const MOUNTS: Record<number, Mount[]> = {
  // --- 1st ---
  0: [reins(4124)], // Aprendiz — Poring
  1: [{ jobId: 4116, nameKey: "peco" }], // Espadachim — Peco (no themed creature)
  2: [reins(4130)], // Mago — Raposa
  3: [reins(4122)], // Arqueiro — Avestruz
  4: [reins(4126)], // Noviço — Alpaca
  5: [reins(4119)], // Mercador — Javali
  6: [reins(4141)], // Gatuno — Cérbero
  // --- 2nd ---
  7: [reins(4199), { jobId: 13, nameKey: "peco" }], // Cavaleiro — Leão / Peco
  14: [reins(4203), { jobId: 21, nameKey: "peco" }], // Templário — Leão / Peco
  8: [reins(4156)], // Sacerdote — Alpaca
  15: [reins(4125)], // Monge — Alpaca
  9: [reins(4134)], // Bruxo — Raposa
  16: [reins(4131)], // Sábio — Raposa
  11: [reins(4154)], // Caçador — Avestruz
  19: [reins(4149)], // Bardo — Avestruz
  20: [reins(4147)], // Odalisca — Avestruz
  10: [reins(4138)], // Ferreiro — Javali
  18: [reins(4137)], // Alquimista — Javali
  12: [reins(4145)], // Mercenário (Assassin) — Cérbero
  17: [reins(4142)], // Arruaceiro — Cérbero
  // --- trans ---
  4001: [reins(4124)],
  4002: [{ jobId: 4116, nameKey: "peco" }],
  4003: [reins(4130)],
  4004: [reins(4122)],
  4005: [reins(4126)],
  4006: [reins(4119)],
  4007: [reins(4141)],
  4008: [reins(4200), { jobId: 4014, nameKey: "peco" }], // Lorde — Leão / Peco
  4015: [reins(4204), { jobId: 4022, nameKey: "peco" }], // Paladino — Leão / Peco
  4009: [reins(4157)], // Sumo Sacerdote
  4016: [reins(4139)], // Mestre (Champion)
  4010: [reins(4136)], // Arquimago (High Wizard)
  4017: [reins(4135)], // Professor
  4012: [reins(4150)], // Atirador de Elite (Sniper)
  4020: [reins(4153)], // Menestrel (Clown)
  4021: [reins(4152)], // Cigana (Gypsy)
  4011: [reins(4118)], // Mestre Ferreiro (Whitesmith)
  4019: [reins(4121)], // Criador (Creator)
  4013: [reins(4146)], // Algoz (Assassin Cross)
  4018: [reins(4144)], // Desordeiro (Stalker)
  // --- 3rd ---
  4054: [reins(4202), { jobId: 4109, nameKey: "dragon" }], // Cavaleiro Rúnico — Leão / Dragão
  4066: [reins(4201), { jobId: 4110, nameKey: "griffon" }], // Guardião Real — Leão / Grifo
  4057: [reins(4129)], // Arcebispo
  4070: [reins(4127)], // Shura
  4055: [reins(4133)], // Arcano (Warlock)
  4067: [reins(4132)], // Feiticeiro (Sorcerer)
  4056: [reins(4198), { jobId: 4111, nameKey: "wolf" }], // Sentinela — Avestruz / Lobo
  4068: [reins(4148)], // Trovador (Minstrel)
  4069: [reins(4151)], // Musa (Wanderer)
  4058: [reins(4197), { jobId: 4112, nameKey: "madogear" }], // Mecânico — Javali / Madogear
  4071: [reins(4120)], // Bioquímico (Genetic)
  4059: [reins(4140)], // Sicário (Guillotine Cross)
  4072: [reins(4143)], // Renegado (Shadow Chaser)
  // --- 4th (Rédeas = the class's own *_RIDING sprite) ---
  4252: [reins(4265), { jobId: 4280, nameKey: "griffon" }], // Cav. Draconiano — Rédeas / Grifo
  4258: [reins(4271), { jobId: 4281, nameKey: "griffon" }], // Guardião Imperial — Rédeas / Grifo
  4256: [reins(4269)], // Cardeal
  4262: [reins(4275)], // Inquisidor
  4255: [reins(4268)], // Magus (Arch Mage)
  4261: [reins(4274)], // Elementalista
  4257: [reins(4270), { jobId: 4278, nameKey: "wolf" }], // Falcão do Vento — / Lobo
  4263: [reins(4276)], // Maestro (Troubadour)
  4264: [reins(4277)], // Diva (Trouvère)
  4253: [reins(4266), { jobId: 4279, nameKey: "madogear" }], // Engenheiro — / Madogear
  4259: [reins(4272)], // Cientista (Biolo)
  4254: [reins(4267)], // Executor (Shadow Cross)
  4260: [reins(4273)], // Mandraque (Abyss Chaser)
  // --- expanded ---
  23: [reins(4128)], // Superaprendiz
  24: [{ jobId: 4115, nameKey: "peco" }], // Justiceiro (Gunslinger) — Peco
  4215: [{ jobId: 4216, nameKey: "peco" }], // Insurgente (Rebellion) — Peco
  25: [reins(4114)], // Ninja — Sapo
  4211: [reins(4213)], // Kagerou — Sapo
  4212: [reins(4214)], // Oboro — Sapo
  4046: [reins(4155)], // Taekwon — Poring
  4047: [reins(4123)], // Mestre Taekwon (Star Gladiator) — Poring
  4049: [reins(4117)], // Espiritualista (Soul Linker) — Sapo
  // expanded 4th jobs (Rédeas = the class's own *_RIDING sprite; ids are the
  // ragassets render ids — standing 4302-4307, riding 4309-4314)
  4302: [reins(4309)], // Sky Emperor
  4303: [reins(4310)], // Soul Ascetic
  4304: [reins(4311)], // Shinkiro
  4305: [reins(4312)], // Shiranui
  4306: [reins(4313)], // Night Watch
  4307: [reins(4314)], // Hyper Novice
  // --- doram ---
  4218: [reins(4219)], // Invocador (Summoner) — Carrinho
};

export function mountsFor(classId: number): Mount[] {
  return MOUNTS[classId] ?? [];
}
