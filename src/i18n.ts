// UI strings — pt-BR only (the LATAM server's language).

/** "a, b e c" — the one bit of grammar these strings need. Not Intl.ListFormat:
 *  this file is single-locale by design, and the tooltip it serves is built
 *  once per visible tile. */
const joinAnd = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

export const t = {
  appTitle: "Simulador de Visuais",
  appSubtitle: "Ragnarok Online LATAM",

  feedbackLink: "Reportar",
  feedbackTitle: "Reportar bug ou pedir visual",
  trackingLink: "Acompanhar",
  trackingTitle: "Acompanhar bugs e pedidos reportados",
  discordLink: "Discord",
  discordTitle: "Entre no servidor do Discord",

  playLink: "Explorar mapa",
  playTitle: "Caminhe com seu personagem por qualquer mapa de Ragnarok (experimental)",
  simLoading: "Carregando o mapa…",
  simError: "Não foi possível carregar o mapa.",
  simClose: "Fechar (Esc)",
  simInspired: "Inspirado no roBrowser",
  simSit: "Sentar (Insert)",
  simDead: "Morrer",
  simFlyWing: "Asa de Mosca (Espaço)",
  simMapLabel: "Mapa",
  simMusicOn: "Música: ligada",
  simMusicOff: "Música: desligada",
  simMusicTitle: "Ligar/desligar a música do mapa",

  // Pet companion (browiki "Mascotes"): a monster that follows you on the map.
  petsButton: "Mascotes",
  petsTitle: "Mascotes",
  petsRemove: "Remover mascote",
  petsSearch: "Buscar mascote…",

  themeLabel: "Tema",
  themeAuto: "Auto",
  themeLight: "Claro",
  themeDark: "Escuro",

  appearanceTitle: "Personagem",
  saveInfoLabel: "Sobre o salvamento automático",
  saveInfoText:
    "Seus personagens são salvos automaticamente. Use os números abaixo para alternar entre personagens " +
    "salvos — cada número guarda um visual diferente (classe, gênero, cabelo, cores e visuais " +
    "equipados). Atalho: Alt + número. A pose e a rotação atuais são mantidas ao trocar. " +
    "Um visual diferente aberto por link só é salvo quando você escolhe Salvar ou Substituir.",
  sharedBuildTitle: "Visual do link",
  sharedBuildNotice: "Ainda não salvo. Escolha onde guardar este visual ou use os números acima para voltar aos seus personagens.",
  sharedBuildTarget: "Salvar no personagem",
  characterNumber: (n: number) => `Personagem ${n}`,
  sharedBuildSave: "Salvar",
  sharedBuildReplace: "Substituir",
  slotBarLabel: "Personagens salvos",
  slotSwitchTip: (n: number) => `Personagem ${n} (Alt+${n})`,
  slotWipeTip: "Limpar este personagem (tira tudo o que foi escolhido)",
  classLabel: "Classe",
  classSearch: "Buscar classe…",
  classSearchEmpty: "Nenhuma classe encontrada.",
  genderLabel: "Gênero",
  genderMale: "Masculino",
  genderFemale: "Feminino",
  hairStyleLabel: "Estilo de cabelo",
  hairColorLabel: "Cor do cabelo",
  outfitLabel: "Estilo da roupa",
  outfitDefault: "Original",
  outfitAlt: "Alternativo",
  outfitAltN: (n: number) => `Alternativo ${n}`,
  outfitDefaultTip: "A roupa original da classe",
  outfitAltTip: "A roupa alternativa da classe — as cores mudam junto",
  clothesColorLabel: "Cor da roupa",
  defaultColor: "Padrão",
  colorTooltip: (n: number) => `Cor ${n}`,
  styleTooltip: (n: number) => `Estilo ${n}`,

  skinLabel: "Tom de pele",
  skinDefault: "Pele original",
  skinToneTip: (n: number) => `Tom ${n}`,
  skinCustom: "Cor personalizada",
  skinInfoLabel: "Sobre o tom de pele",
  skinInfoText:
    "Isto é uma adição feita por fãs. O Ragnarok não tem opção de tom de pele: não " +
    "existe essa escolha no jogo, e nenhum sprite oficial vem em mais de um tom. As cores são " +
    "geradas aqui, a partir da própria paleta de cada sprite, então o seu personagem não vai " +
    "aparecer assim no jogo. Não funciona para Doram. Ao escolher um tom, a cor da roupa deixa " +
    "de tingir a pele junto.",

  previewError: "Não foi possível carregar o sprite.",
  bodyDirLabel: "Corpo",
  headDirLabel: "Cabeça",
  rotateLeft: "Girar o corpo para a esquerda",
  rotateRight: "Girar o corpo para a direita",
  rotateHeadLeft: "Girar a cabeça para a esquerda",
  rotateHeadRight: "Girar a cabeça para a direita",
  actionsLabel: "Ação",
  mountLabel: "Montaria",
  mountOn: "Montar",
  mountOff: "Desmontar",
  flightLabel: "Voo",
  flightOn: "Voar (União Solar, Lunar e Estelar)",
  flightOff: "Pousar",
  viewFull: "Ver sprite completo",
  closeModal: "Fechar",
  downloadImage: "Baixar imagem",
  downloadError: "Falha ao baixar. Tente novamente.",
  detachPreview: "Destacar em janela flutuante",
  attachPreview: "Voltar para tela cheia",
  dragWindow: "Arraste para mover",
  resizeWindow: "Arraste para redimensionar",
  play: "Reproduzir",
  pause: "Pausar",
  frameLabel: "Quadro",
  effectTimeLabel: "Efeito",
  zoomIn: "Aproximar",
  zoomOut: "Afastar",
  zoomReset: "Voltar ao tamanho que cabe",
  framePrev: "Quadro anterior",
  frameNext: "Próximo quadro",

  // Animation states, wired to the zrenderer animation types in state.ts.
  actions: {
    idle: "Parado",
    walk: "Andar",
    sit: "Sentar",
    pickup: "Pegar item",
    standby: "Em guarda",
    attack1: "Atacar 1",
    attack2: "Atacar 2",
    attack3: "Atacar 3",
    casting: "Conjurando",
    hurt: "Ferido",
    frozen: "Atordoado",
    dead: "Morto",
    frozen2: "Congelado",
  },

  // Mount display names (see core/mounts.ts). "Rédeas" is the universal mount
  // every class can ride; the others are class-signature mounts.
  mountNames: {
    reins: "Rédeas",
    peco: "Peco Peco",
    dragon: "Dragão",
    griffon: "Grifo",
    wolf: "Worg",
    madogear: "MECHA",
    madosuit: "MECHA alternativo",
  },

  slotsTitle: "Visuais equipados",
  wishlistButton: "Lista de desejos",
  wishlistTitle: "Lista de desejos",
  wishlistEmpty: "Equipe visuais para vê-los aqui.",
  wishlistHint: "Toque no nome para ver no Divine-Pride; no carrinho para buscar no mercado.",
  serverLabel: "Servidor",
  divineLink: "Ver no Divine-Pride",
  marketSearch: "Buscar no mercado",
  wishlistCount: (n: number) => `(${n})`,
  slotNames: {
    top: "Topo",
    mid: "Meio",
    low: "Baixo",
    garment: "Capa",
  } as Record<string, string>,
  slotEmpty: "Vazio",
  slotClear: "Remover",
  slotFilterHint: (slot: string) => `Ver visuais de ${slot}`,

  // Pedras Gráficas — the graphic-effect enchants that go inside a costume
  // (browiki "Encantamento de Visual").
  stoneLabel: "Pedra gráfica",
  stoneEmpty: "Sem pedra",
  stoneClear: "Remover pedra",
  stoneFilterHint: (slot: string) => `Ver pedras gráficas de ${slot}`,
  stoneNeedsCostume: "Encanta um visual: equipe um visual nesta posição para valer no jogo.",
  stoneNoEffect:
    "Sem prévia: este efeito é desenhado pelo próprio programa do jogo, não por um " +
    "arquivo de efeito — não dá para mostrar aqui nem no mapa.",
  stoneNoEffectShort: "sem prévia",
  stoneFootprint: "Aparece no chão enquanto o personagem anda, na visão de mapa.",
  stoneFootprintPending:
    "Aparece no chão quando o personagem anda — mas o desenho ainda não foi extraído do jogo, " +
    "então por enquanto não dá para mostrar.",
  stoneFootprintShort: "pegada",

  catalogTitle: "Visuais",
  searchPlaceholder: "Buscar por nome ou ID…",
  allSlots: "Todos",
  itemCount: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  noResults: "Nenhum visual encontrado.",
  stoneBadge: "Pedra",
  equippedBadge: "Equipado",

  filtersButton: "Filtros",
  filtersTitle: "Filtrar visuais",
  filtersClear: "Limpar",
  filtersActive: (n: number) => `${n} filtro${n === 1 ? "" : "s"} ativo${n === 1 ? "" : "s"}`,
  slotFilterLabel: "Posição",
  kindFilterLabel: "Tipo",
  kindAll: "Todos",
  kindCostumes: "Visuais",
  kindStones: "Pedras gráficas",
  kindAllTip: "Visuais e pedras gráficas juntos.",
  kindCostumesTip: "Só os visuais — o que você veste em cada posição.",
  kindStonesTip:
    "Só as pedras gráficas: encantes de efeito que vão dentro de um visual, sem ocupar a posição.",
  singleSlotLabel: "Só visuais de uma posição",
  singleSlotTip:
    "Esconde os visuais que ocupam mais de uma posição ao mesmo tempo (um conjunto de Topo + Meio, por exemplo), que ao equipar tiram o que estiver nas outras.",
  // The costumes nobody here can get. Off by default, and the wording has to
  // carry the one thing that matters: they are real, they draw, and you cannot
  // get them in game.
  //
  // Two kinds sit behind this box and the difference is worth the words. Most
  // are in another official server's client. About 800 are in *this* client —
  // the art ships with the game, the accessory table has the view, and no item
  // was ever released that gives it to anybody. Saying "não existe no Ragnarok
  // LATAM" about those would be plainly false to anyone who knows the files,
  // so nothing here says it.
  foreignFilterLabel: "Fora do catálogo",
  foreignLabel: "Visuais que não dá para conseguir",
  foreignTip:
    "Mostra os visuais que não dá para conseguir no Ragnarok LATAM: os que existem em outros servidores oficiais, e os que já estão no cliente daqui mas nunca foram lançados. Dá para vestir e ver na prévia.",
  foreignAllServers: "Todos",
  foreignAllServersTip:
    "O catálogo do LATAM e, junto com ele, todos os visuais que não dá para conseguir.",
  /** Each server chip answers one question — o que esse servidor tem que o
   *  LATAM não tem — e por isso tira o catálogo daqui da lista: misturado com
   *  1322 visuais que dá para conseguir, a resposta não é mais uma resposta. */
  foreignOnlyServerTip: (server: string) =>
    `Só os visuais que ${server} tem e o Ragnarok LATAM não. O catálogo daqui fica de fora da lista.`,
  /** The one chip that is not about another server: the art is in this client
   *  and no item ever gave it to anybody. */
  foreignUnreleasedTip:
    "Só os visuais que já estão no cliente do Ragnarok LATAM e nunca foram lançados aqui. O catálogo daqui fica de fora da lista.",
  foreignServerNames: {
    /** Not "LATAM": a chip reading the server's own name, among chips that each
     *  mean "what this server has and we don't", would read as the catalogue
     *  itself. What it selects is the visuals this client has and never gave
     *  out, so that is what it says — singular, because the same string is the
     *  badge on one tile. */
    latam: "Não lançado",
    iro: "iRO",
    jro: "jRO",
    kro: "kRO",
    krozero: "kRO Zero",
    thro: "thRO",
    twro: "twRO",
    twrozero: "twRO Zero",
  } as Record<string, string>,
  /** Badge on a foreign costume in the grid, in the list and on the equipped
   *  chip. It names one server — whichever chip is held down, or the first the
   *  costume belongs to. */
  foreignBadge: (server: string) => server,
  /** The tile has room for one name. "+3" is how it says there are others,
   *  since 162 of the costumes are on four servers or more and a 53x48 tile
   *  fits one 8px line. The list view shows every name instead. */
  foreignBadgeMore: (n: number) => `+${n}`,
  /** The badge's tooltip, and the only place every server is written out: the
   *  tile shows one name and a "+3", so without this there is nothing that
   *  answers which three. Takes the display names, already in chip order. */
  foreignBadgeTip: (servers: string[]) =>
    `${
      servers.length > 1
        ? `Visual de outros servidores (${joinAnd(servers)})`
        : `Visual de outro servidor${servers.length ? ` (${servers[0]})` : ""}`
    }. Não existe no Ragnarok LATAM — dá para vestir e ver aqui, mas não dá para conseguir no jogo.`,
  /** The same badge for a visual that is already in this client. `others` are
   *  the servers that have it too, which is the part that says where the look
   *  came from — and is empty for the 17 that are ours alone (a Brazilian flag
   *  hat, the old guild-recruiting hats) and exist nowhere else. */
  foreignUnreleasedBadgeTip: (others: string[]) =>
    `Visual que já está no cliente do Ragnarok LATAM e nunca foi lançado aqui${
      others.length ? ` — ${joinAnd(others)} ${others.length > 1 ? "lançaram" : "lançou"}` : ", e não existe em nenhum outro servidor"
    }. Dá para vestir e ver aqui, mas não dá para conseguir no jogo.`,
  foreignUnnamedTip:
    "Sem nome: nenhum cliente que lemos tinha a linha de item desse visual, então o nome mostrado é o do arquivo do sprite.",
  foreignForeignNameTip: (server: string) =>
    `Nome vindo das tabelas de ${server}, no idioma daquele cliente.`,

  viewGrid: "Grade",
  viewList: "Lista",

  // Discovery hints: shown on their own the first few times, and silenced for
  // good once the feature is actually used (see core/hints.ts).
  hintDetach: "Dica: destaque a prévia para trocar de visual sem fechar",
  hintArrowsGrid: "Dica: use ↑ ↓ ← → para ir para o próximo visual",
  hintArrowsList: "Dica: use ↑ ↓ para ir para o próximo visual",

  groups: {
    novice: "Aprendiz",
    first: "1ª Classe",
    second: "2ª Classe",
    trans: "Transcendentes",
    third: "3ª Classe",
    fourth: "4ª Classe",
    expanded: "Classes Expandidas",
    doram: "Doram",
  } as Record<string, string>,

  loading: "Carregando dados…",
  loadError: "Não foi possível carregar os dados do simulador.",

  footerTools: "Outras ferramentas",
  footerChangelog: "Novidades",
  changelogTitle: "Novidades",
  footerCopyright: "© Gravity Interactive, Inc. All Rights Reserved.",
  footerSource: "Código no GitHub",
};

/** The badge tooltip for one row of the out-of-catalogue catalogue, from its
 *  raw `origins`.
 *
 *  Lives here, next to the strings, and is called from all three places that
 *  show the badge — the grid tile, the list row and the worn-slot card. It was
 *  three copies of `t.foreignBadgeTip(origins.map(name))` until a `latam`
 *  entry started meaning something else: the sentence for a visual that is
 *  already in this client is a different sentence, and a fourth copy of the
 *  branch is three chances to get it wrong.
 */
export function originsTip(origins: string[]): string {
  const name = (o: string) => t.foreignServerNames[o] ?? o;
  if (origins.includes("latam")) {
    return t.foreignUnreleasedBadgeTip(origins.filter((o) => o !== "latam").map(name));
  }
  return t.foreignBadgeTip(origins.map(name));
}
