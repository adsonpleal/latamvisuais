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
