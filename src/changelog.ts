// Changelog mostrado no app (rodapé → janela "Novidades"). Conteúdo voltado ao
// usuário, em pt-BR — mantenha as entradas curtas e sem jargão técnico. O
// registro técnico detalhado fica em CHANGELOG.md, na raiz do projeto.
//
// A primeira entrada é a versão atual (usada também no rótulo do rodapé).

export type ChangelogEntry = {
  version: string;
  date: string; // AAAA-MM-DD
  changes: string[];
  /** Crédito de quem reportou/ajudou — destacado no fim da entrada. */
  credit?: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.11.0",
    date: "2026-08-10",
    changes: [
      "As classes de 3ª agora podem vestir a roupa alternativa, aquela segunda versão do traje que existe no jogo. O botão “Estilo da roupa” fica ao lado do Gênero, nas classes que têm uma: as treze de 3ª, mais Cardeal, Inquisidor e Magus. As cores mudam junto com o estilo — cada traje tem a sua paleta, e os três de 4ª só vêm nas cores originais mesmo.",
      "Novo botão de limpar ao lado dos números dos personagens: tira tudo o que você escolheu de uma vez (classe, gênero, cabelo, cores, visuais, montaria e mascote) e devolve o espaço em branco. Ele fica apagado quando não há nada para limpar.",
      "As Asas Esvoaçantes de Arcanjo estavam desenhadas fora do lugar no personagem. Já foi corrigido.",
      "O rodapé encolheu quase pela metade: letra menor, duas linhas no lugar de três e só os links que alguém realmente usa. Sobrou mais altura para o personagem e para a lista de visuais.",
      "Dados atualizados com a última versão do jogo: a Mochila de Hatii entrou na lista, e os dois Gorros de Carneirinho agora aparecem também nos filtros de Meio e Baixo, que é onde eles equipam de verdade.",
    ],
    // Uma única string literal: o post-novidades.mjs lê o primeiro literal do
    // campo, então uma concatenação com "+" perderia o resto dos créditos.
    credit: "Obrigado a Kurohitsugi e V, que reportaram as Asas Esvoaçantes de Arcanjo fora de posição; a Gabmid, que pediu o botão de limpar; e a rflazv, que lembrou das roupas alternativas.",
  },
  {
    version: "0.10.0",
    date: "2026-08-10",
    changes: [
      "O catálogo agora sabe o que dá para comprar. Em Filtros você escolhe ver só os visuais que já apareceram no mercado alguma vez, ou só os que estão à venda neste momento. Passe o mouse por cada opção para ver a diferença entre as duas.",
      "Nova visão em lista (o botão ao lado da contagem): cada visual em uma linha, com o nome inteiro, a posição e o preço — por quanto está saindo e em quantas lojas, ou a média do que já foi vendido quando ninguém está vendendo agora. Clique em qualquer parte da linha para provar o visual.",
      "O ID de cada visual virou link para o Divine-Pride, e o carrinho leva direto para a página do item no nosso mercado (mercado.latam-tools.com.br), pelo ID. Antes o carrinho caía numa busca por nome no site oficial, que errava sempre que os nomes não batiam.",
      "Os filtros de posição (Topo, Meio, Baixo, Capa) saíram da linha de botões e foram para dentro do Filtros, junto com a escolha de servidor — sobrou mais espaço para a lista de visuais.",
      "Nome comprido cortado na lista? Passe o mouse para ler ele inteiro.",
    ],
  },
  {
    version: "0.9.8",
    date: "2026-07-30",
    changes: [
      "Dois visuais que sumiram da lista voltaram: o Tao Gunka Flutuante e o Escudo Petulante. Eles equipam na Capa, mas o desenho deles é do tipo que o jogo usa nos chapéus — o simulador pedia do jeito errado e não vinha nada, então achávamos que eram efeitos e tiramos da lista.",
      "O Buquê Gigantesco agora mostra o buquê de verdade: no lugar dele aparecia a Máscara do Fantasma da Ópera, por causa da mesma confusão de desenhos.",
    ],
  },
  {
    version: "0.9.7",
    date: "2026-07-24",
    changes: [
      "As classes expandidas de 4ª agora aparecem com o nome em português: Mestre Celestial, Asceta das Almas, Guerrilheiro e Hiperaprendiz — no lugar dos nomes em inglês que estavam ali de reserva. Shinkiro e Shiranui continuam com o nome original, como no jogo.",
      "Mais um visual na lista: os Cabelos de Betelgeuse já dá pra provar no simulador.",
    ],
  },
  {
    version: "0.9.6",
    date: "2026-07-23",
    changes: [
      "Nova classe: a Animista, a 4ª classe dos Dorams, já aparece no seletor — com troca de cor de roupa e a montaria de Rédeas, como no jogo.",
      "Novos visuais na lista! Os itens que chegaram na última atualização do jogo — como os Óculos Alados, o Leque de Veraneio, o Elmo de Detardeurus, o Capuz de Drops e a Peruca de Petal — já dá pra provar no simulador.",
      "As classes expandidas de 4ª (Sky Emperor, Hyper Novice e companhia) agora mostram o ícone oficial de cada uma no seletor, no lugar do bonequinho que aparecia antes.",
      "Os estilos de cabelo mais novos (do 33 ao 42) agora aceitam todas as cores de tintura, e não só a cor padrão.",
    ],
  },
  {
    version: "0.9.5",
    date: "2026-07-18",
    changes: [
      "A lupa da tela cheia ficou com o dobro do tamanho e uma ampliação mais suave — dá pra ver uma parte bem maior do personagem de uma vez, sem aquele efeito exagerado de perto demais.",
    ],
  },
  {
    version: "0.9.4",
    date: "2026-07-18",
    changes: [
      "Cada ação agora mostra o nome embaixo do bonequinho — não precisa mais passar o mouse pra descobrir qual é qual.",
      "Arrumamos a lista de estilos de cabelo em telas baixas: os cabelos ficavam um por cima do outro e invadiam as cores logo abaixo. Agora a lista encolhe até um tamanho mínimo e, se ainda faltar espaço, o painel inteiro rola.",
    ],
  },
  {
    version: "0.9.3",
    date: "2026-07-12",
    changes: [
      "Mais visuais na lista! Vários itens que o jogo esqueceu de marcar como visual — e por isso não apareciam no simulador — voltaram ao catálogo, como o Quepe do Capitão, o Chapéu de Praia, a Tiara de Randgris e muitos outros.",
    ],
    credit:
      "Obrigado Shummuy, que reportou o [Visual] Quepe do Capitão faltando na lista.",
  },
  {
    version: "0.9.2",
    date: "2026-07-07",
    changes: [
      "Novos visuais na lista! Os itens que chegaram na última atualização do jogo — como o Boneco de Betelgeuse, os Cabelos de Freya, as Asas de Letícia, as Asas Caídas de Freya e as novas Piscadelas — já aparecem no simulador.",
      "Faxina na lista: tiramos alguns visuais que não apareciam no personagem, pra o catálogo mostrar só o que dá pra ver de verdade.",
    ],
  },
  {
    version: "0.9.1",
    date: "2026-06-30",
    changes: [
      "As setas de girar agora aparecem também na tela cheia do personagem — dá pra rodar o corpo e a cabeça sem fechar o zoom.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-06-30",
    changes: [
      "Os mapas ganharam vida! Agora cada um toca a própria música e mostra os efeitos do cenário como no jogo — tochas acesas, vaga-lumes, bolhas embaixo d'água, fumaça e a névoa de cada lugar.",
      "O mapa que você está explorando agora faz parte do link: compartilhe ou salve o endereço e ele abre direto naquele mapa.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-28",
    changes: [
      "Explore qualquer mapa! A exploração não fica mais presa ao campo de treinamento: um seletor com busca (no canto da tela) lista todos os mapas de Ragnarok — escolha qualquer um e caminhe por ele com seu personagem e sua mascote.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-06-27",
    changes: [
      "Mascotes no modo mapa! O novo botão “Mascotes” (abaixo da Montaria) abre uma grade com todos os bichinhos de estimação — escolha um e ele aparece ao seu lado e te acompanha andando pelo mapa, como no jogo.",
      "A mascote escolhida fica salva no personagem e vai junto no link de compartilhamento; o ovo dela também aparece na sua Lista de desejos.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-06-27",
    changes: [
      "Novas classes na lista! As classes expandidas de 4ª — Sky Emperor, Soul Ascetic, Shinkiro, Shiranui, Night Watch e Hyper Novice — já aparecem no seletor, com troca de cor de roupa e o botão de montaria.",
      "Como o LATAM ainda não tem o nome em pt-BR dessas classes, usamos os nomes do iRO (em inglês) por enquanto — serão atualizados assim que saírem por aqui.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-06-20",
    changes: [
      "Visuais de efeito (auras, pétalas, holofotes, círculos mágicos e afins) voltaram à lista! O personagem não consegue desenhá-los na pré-visualização 2D, então agora eles aparecem ao seu redor no modo mapa (3D). Um ícone de mapa nos espaços equipados marca os visuais que só aparecem por lá.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-06-19",
    changes: [
      "Novo modo jogável (beta)! Um botão de mapa na pré-visualização leva seu personagem para andar pelo mapa tra_fild em 3D: clique para se mover, gire e dê zoom na câmera. A mesma sprite do simulador, agora caminhando pelo mapa.",
      "Personagens salvos: 6 espaços acima da lista de classes guardam seus visuais montados. Troque com um clique ou Alt+número — cada espaço salva sozinho conforme você monta o visual.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-06-18",
    changes: [
      "Agora dá para montar! Um botão “Montaria” abaixo da “Ação” coloca o personagem na montaria. Toda classe tem a Rédeas (montaria universal), e classes com montaria própria — Peco Peco, Dragão, Grifo, Worg, MECHA e mais — deixam você escolher entre as duas.",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-06-17",
    changes: [
      "Visuais com animação própria (como as Asas Áureas de Arcanjo e acessórios animados) agora exibem a própria animação ao pausar ou avançar quadro a quadro nas poses Parado e Sentado — antes a cabeça girava no lugar da animação do visual.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-16",
    changes: [
      "Vários visuais que não apareciam no personagem agora são exibidos corretamente (Chapéu de Peru, Kafra Bianca, Cartola da Guarda Real, Asa Mecânica, Brasão de Midgard, Véu Obscuro e muitos outros).",
      "Área de pré-visualização maior: visuais altos e largos (Balão de MVP, Planeta Terra, Deviruchi Inflável, Muralha…) não ficam mais cortados.",
      "Visuais 3D e efeitos (auras, brilhos, climas e afins), que o simulador não consegue exibir em 2D, foram retirados da lista — com um botão “?” explicando o porquê.",
      "Miniaturas que faltavam na lista (Tiaras de Laço, Chapéu Pré-Escolar) voltaram a aparecer.",
    ],
    credit:
      "Obrigado a kharuuldan, que testou o simulador a fundo e reportou os problemas que motivaram esta atualização.",
  },
  {
    version: "0.1.0",
    date: "2026-06-12",
    changes: ["Lançamento inicial do simulador de visuais do Ragnarok Online LATAM."],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
