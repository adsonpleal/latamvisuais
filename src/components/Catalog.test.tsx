import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Slot } from "../core/db";
import { StateHarness } from "../test/StateHarness";
import { Catalog } from "./Catalog";

// The catalogue's slot filter is owned by App; this host mirrors that wiring so
// the chips and the equip toggling behave as they do in the real tree.
function CatalogHost() {
  const [slotFilter, setSlotFilter] = useState<Slot | null>(null);
  return <Catalog slotFilter={slotFilter} onSlotFilterChange={setSlotFilter} pickSignal={0} />;
}

function renderCatalog() {
  return render(
    <StateHarness>
      <CatalogHost />
    </StateHarness>,
  );
}

const tile = (label: string) => screen.getByLabelText(label);

// Chapéu A has been seen and is on sale; Máscara B has been seen but isn't;
// nothing else has ever reached the market.
const MARKET_IDS = { inMarket: [100, 200], forSale: [100], nextTradingAt: null };

const PRICES: Record<number, unknown> = {
  100: {
    itemId: 100,
    name: "Chapéu A",
    inMarket: true,
    market: { min: 1_000_000, max: 9_000_000, avg: 2_500_000, totalSold: 12 },
    offers: { stores: 3, units: 3, min: 1_500_000, median: 2_000_000 },
  },
  200: {
    itemId: 200,
    name: "Máscara B",
    inMarket: true,
    market: { min: 300_000, max: 800_000, avg: 500_000, totalSold: 4 },
    offers: null,
  },
};

/** Stands in for the market service: the id sets and a price batch. */
function marketFetch(input: string): Promise<Response> {
  const url = new URL(input);
  if (url.pathname.endsWith("/ids")) {
    return Promise.resolve({ ok: true, json: async () => MARKET_IDS } as Response);
  }
  const ids = (url.searchParams.get("items") ?? "").split(",").map(Number);
  const prices = ids.map((id) => PRICES[id]).filter(Boolean);
  return Promise.resolve({ ok: true, json: async () => ({ prices, missing: [] }) } as Response);
}

/** Opens the filter popover, which is where every chip now lives. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Filtros/ }));
}

const marketChip = (name: string) =>
  within(screen.getByRole("group", { name: "Mercado" })).getByRole("button", { name });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => marketFetch(input)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Catalog", () => {
  // First on purpose: the id sets are cached per server for the session, so any
  // earlier test that opened the popover would have already paid for them.
  it("asks the market nothing until a filter needs it", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.type(screen.getByRole("searchbox"), "chapeu");
    expect(fetch).not.toHaveBeenCalled();

    await openFilters(user);
    expect(fetch).toHaveBeenCalled();
  });

  it("searches case- and accent-insensitively over name and id", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.type(screen.getByRole("searchbox"), "chapeu"); // matches "Chapéu A"
    expect(tile("Chapéu A (#100)")).toBeVisible();
    expect(tile("Máscara B (#200)")).not.toBeVisible();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "300"); // matches by id
    expect(tile("Boca C (#300)")).toBeVisible();
    expect(tile("Chapéu A (#100)")).not.toBeVisible();
  });

  it("filters by slot when a chip is selected", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await openFilters(user);
    await user.click(
      within(screen.getByRole("group", { name: "Posição" })).getByRole("button", { name: "Meio" }),
    );
    // Items that occupy "mid": Máscara B and the top+mid combo.
    expect(tile("Máscara B (#200)")).toBeVisible();
    expect(tile("Conjunto Topo+Meio (#500)")).toBeVisible();
    expect(tile("Chapéu A (#100)")).not.toBeVisible();
    expect(tile("Capa D (#400)")).not.toBeVisible();
  });

  it("toggles the equipped highlight on click", async () => {
    const user = userEvent.setup();
    renderCatalog();

    const chapeu = tile("Chapéu A (#100)");
    expect(chapeu).not.toHaveClass("is-equipped");

    await user.click(chapeu);
    expect(tile("Chapéu A (#100)")).toHaveClass("is-equipped");

    await user.click(tile("Chapéu A (#100)"));
    expect(tile("Chapéu A (#100)")).not.toHaveClass("is-equipped");
  });

  it("shows the empty message only when nothing matches", async () => {
    const user = userEvent.setup();
    renderCatalog();

    expect(screen.getByText("Nenhum visual encontrado.")).not.toBeVisible();
    await user.type(screen.getByRole("searchbox"), "zzzzz");
    expect(screen.getByText("Nenhum visual encontrado.")).toBeVisible();
  });

  it("keeps only what the market has ever seen, then only what's on sale", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await openFilters(user);
    await user.click(marketChip("Já visto no mercado"));
    await screen.findByText("2 itens");
    expect(tile("Chapéu A (#100)")).toBeVisible();
    expect(tile("Máscara B (#200)")).toBeVisible();
    expect(tile("Capa D (#400)")).not.toBeVisible();

    // The two read alike until the difference bites, so each chip explains
    // itself in the shared tooltip.
    expect(marketChip("Já visto no mercado")).toHaveAttribute(
      "data-tip",
      expect.stringContaining("mesmo que ninguém esteja vendendo agora"),
    );

    await user.click(marketChip("À venda agora"));
    await screen.findByText("1 item");
    expect(tile("Chapéu A (#100)")).toBeVisible();
    // Seen once, nobody selling it now — the two filters are different questions.
    expect(tile("Máscara B (#200)")).not.toBeVisible();
  });

  it("counts the active filters on the trigger and clears them", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await openFilters(user);
    await user.click(marketChip("À venda agora"));
    await user.click(
      within(screen.getByRole("group", { name: "Posição" })).getByRole("button", { name: "Topo" }),
    );
    expect(screen.getByLabelText("2 filtros ativos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar" }));
    expect(screen.queryByLabelText(/filtros? ativos?/)).not.toBeInTheDocument();
    expect(tile("Capa D (#400)")).toBeVisible();
  });

  it("shows name, id and price in the list view, with a link to the market", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(screen.getByRole("button", { name: "Lista" }));
    expect(await screen.findByText("1,5 mi z · 3 lojas")).toBeInTheDocument();
    // Seen before but with no live offer: the published average is the answer.
    expect(screen.getByText("Média 500 mil z · 4 vendidos")).toBeInTheDocument();
    expect(screen.getAllByText("Nunca visto no mercado").length).toBeGreaterThan(0);

    // The id is its own link inside the meta line, so match across both nodes.
    expect(
      screen.getByText(
        (_, el) => el?.className === "catalog-row-meta" && el.textContent === "#100 · Topo",
      ),
    ).toBeInTheDocument();
    // The host comes from VITE_MARKET_URL (a local API during development), so
    // what's pinned here is the route: our market's item page, by id.
    expect(screen.getByRole("link", { name: /Chapéu A/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/mercado\?item=100$/),
    );
  });

  it("equips from anywhere on a list row, and links the id to Divine-Pride", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(screen.getByRole("button", { name: "Lista" }));

    // The pick button is stretched over the whole tile, so this is what a click
    // on the name, the price or the space around the cart lands on.
    const pick = screen.getByRole("button", { name: "Chapéu A (#100)" });
    await user.click(pick);
    expect(pick.closest(".catalog-row")).toHaveClass("is-equipped");

    await user.click(pick);
    expect(pick.closest(".catalog-row")).not.toHaveClass("is-equipped");

    expect(screen.getByRole("link", { name: "#100" })).toHaveAttribute(
      "href",
      "https://www.divine-pride.net/database/item/100/chapeu-a",
    );
  });

  it("offers the full name as a tooltip only when the row cuts it off", async () => {
    const user = userEvent.setup();
    renderCatalog();
    await user.click(screen.getByRole("button", { name: "Lista" }));

    // jsdom doesn't lay anything out, so both widths read 0 — say outright which
    // name overflows its box and which one fits.
    const widths = (name: string, scroll: number, client: number) => {
      const el = screen.getByText(name);
      Object.defineProperty(el, "scrollWidth", { value: scroll, configurable: true });
      Object.defineProperty(el, "clientWidth", { value: client, configurable: true });
      return el;
    };
    widths("Conjunto Topo+Meio", 320, 140);
    widths("Chapéu A", 60, 140);

    await user.hover(screen.getByRole("button", { name: "Conjunto Topo+Meio (#500)" }));
    expect(screen.getByRole("button", { name: "Conjunto Topo+Meio (#500)" })).toHaveAttribute(
      "data-tip",
      "Conjunto Topo+Meio",
    );

    // Readable in full already — a tooltip repeating it would be noise.
    await user.hover(screen.getByRole("button", { name: "Chapéu A (#100)" }));
    expect(screen.getByRole("button", { name: "Chapéu A (#100)" })).not.toHaveAttribute("data-tip");
  });

  it("remembers the chosen view", async () => {
    const user = userEvent.setup();
    const { unmount } = renderCatalog();

    await user.click(screen.getByRole("button", { name: "Lista" }));
    expect(localStorage.getItem("latamvisuais.catalogView")).toBe("list");

    unmount();
    renderCatalog();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  });
});
