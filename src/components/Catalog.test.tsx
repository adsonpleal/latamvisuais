import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Slot } from "../core/db";
import { StateHarness } from "../test/StateHarness";
import { Catalog } from "./Catalog";

// The catalogue's slot filter is owned by App; this host mirrors that wiring so
// the chips and the equip toggling behave as they do in the real tree.
function CatalogHost() {
  const [slotFilter, setSlotFilter] = useState<Slot | null>(null);
  return (
    <Catalog slotFilter={slotFilter} onSlotFilterChange={setSlotFilter} pickSignal={0} />
  );
}

function renderCatalog() {
  return render(
    <StateHarness>
      <CatalogHost />
    </StateHarness>,
  );
}

const tile = (label: string) => screen.getByLabelText(label);

describe("Catalog", () => {
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

    await user.click(screen.getByRole("button", { name: "Meio" }));
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
});
