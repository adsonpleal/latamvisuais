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
  play: "Reproduzir",
  pause: "Pausar",
  frameLabel: "Quadro",
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
  },

  slotsTitle: "Visuais equipados",
  wishlistButton: "Lista de desejos",
  wishlistTitle: "Lista de desejos",
  wishlistEmpty: "Equipe visuais para vê-los aqui.",
  wishlistHint: "Toque no nome para ver no Divine-Pride; no carrinho para ver no mercado.",
  serverLabel: "Servidor",
  divineLink: "Ver no Divine-Pride",
  marketSearch: "Ver no mercado",
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

  catalogTitle: "Visuais",
  catalogInfoLabel: "Sobre os visuais disponíveis",
  catalogInfoText:
    "Visuais de efeito (auras, brilhos, climas e afins) não usam o sprite 2D do " +
    "personagem. Eles aparecem na lista, mas só são exibidos na visão de mapa, " +
    "não na pré-visualização.",
  effectOnlyNote: "Só aparece no mapa",
  searchPlaceholder: "Buscar por nome ou ID…",
  allSlots: "Todos",
  itemCount: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  noResults: "Nenhum visual encontrado.",
  equippedBadge: "Equipado",

  filtersButton: "Filtros",
  filtersTitle: "Filtrar visuais",
  filtersClear: "Limpar",
  filtersActive: (n: number) => `${n} filtro${n === 1 ? "" : "s"} ativo${n === 1 ? "" : "s"}`,
  slotFilterLabel: "Posição",
  marketFilterLabel: "Mercado",
  marketAll: "Todos",
  marketSeen: "Já visto no mercado",
  marketSelling: "À venda agora",
  marketAllTip: "Todos os visuais, tenham passado pelo mercado ou não.",
  marketSeenTip:
    "Só os visuais que já apareceram em alguma coleta do mercado — mesmo que ninguém esteja vendendo agora.",
  marketSellingTip:
    "Só os visuais com pelo menos uma loja vendendo neste momento, na última coleta do mercado.",
  marketLoading: "Consultando o mercado…",
  marketError: "Mercado indisponível — filtro de mercado ignorado.",
  viewGrid: "Grade",
  viewList: "Lista",
  // The cheapest open shop is *the* price — spelling out "a partir de" only
  // padded every row with words that said nothing extra.
  priceFrom: (price: string, stores: number) =>
    `${price} z · ${stores} ${stores === 1 ? "loja" : "lojas"}`,
  priceAvg: (price: string, sold: number) =>
    `Média ${price} z · ${sold} vendido${sold === 1 ? "" : "s"}`,
  priceNoOffers: "Sem ofertas agora",
  priceNeverSeen: "Nunca visto no mercado",
  priceUnavailable: "Preço indisponível",

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
