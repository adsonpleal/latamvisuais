// Accent- and case-folding, in one place: the catalogue search matches on it and
// the Divine-Pride slug is built from it, and two copies of a Unicode
// normalization regex are two chances to disagree about "ç".

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");

/** `fold` plus "anything that isn't a letter or digit becomes a single dash". */
export const slugify = (name: string) =>
  fold(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
