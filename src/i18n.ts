// UI strings — pt-BR only (the LATAM server's language).

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
    "Tudo é salvo automaticamente. Use os números abaixo para alternar entre personagens " +
    "salvos — cada número guarda um visual diferente (classe, gênero, cabelo, cores e visuais " +
    "equipados). Atalho: Alt + número. A pose e a rotação atuais são mantidas ao trocar.",
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
