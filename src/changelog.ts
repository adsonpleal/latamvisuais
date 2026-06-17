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
