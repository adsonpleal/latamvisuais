import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "../test/fixtures";
import { StateHarness } from "../test/StateHarness";
import { Wishlist } from "./Wishlist";

const db = makeDb();
const item = (id: number) => db.costumes.find((c) => c.id === id)!;
const stone = (id: number) => db.stones.find((s) => s.id === id)!;

function renderWishlist() {
  return render(
    <StateHarness db={db} init={{ equipped: { top: item(100), garment: item(400) } }}>
      <Wishlist />
    </StateHarness>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("Wishlist", () => {
  it("shows a count badge of distinct equipped costumes", () => {
    renderWishlist();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("lists each item with a Divine-Pride link", async () => {
    const user = userEvent.setup();
    renderWishlist();
    await user.click(screen.getByRole("button", { name: /Lista de desejos/ }));

    const link = screen.getByRole("link", { name: "Chapéu A" });
    expect(link).toHaveAttribute(
      "href",
      "https://www.divine-pride.net/database/item/100/chapeu-a",
    );
  });

  it("includes the selected pet's egg as its own item", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness db={db} init={{ pet: 1002 }}>
        <Wishlist />
      </StateHarness>,
    );
    await user.click(screen.getByRole("button", { name: /Lista de desejos/ }));
    const link = screen.getByRole("link", { name: "Ovo de Poring" });
    expect(link).toHaveAttribute(
      "href",
      "https://www.divine-pride.net/database/item/9001/ovo-de-poring",
    );
  });

  it("routes market links through the selected server and remembers it", async () => {
    const user = userEvent.setup();
    renderWishlist();
    await user.click(screen.getByRole("button", { name: /Lista de desejos/ }));

    const market = screen.getAllByRole("link", { name: "Buscar no mercado" })[0];
    expect(market).toHaveAttribute("href", expect.stringContaining("ro.gnjoylatam.com"));
    expect(market).toHaveAttribute("href", expect.stringContaining("serverType=FREYA"));

    await user.selectOptions(screen.getByRole("combobox"), "NIDHOGG");
    expect(localStorage.getItem("latamvisuais.server")).toBe("NIDHOGG");
    expect(screen.getAllByRole("link", { name: "Buscar no mercado" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("serverType=NIDHOGG"),
    );
  });

  // A stone is bought like anything else on the list, so it belongs on it —
  // and next to the costume it goes inside, not at the end.
  it("lists an enchanted graphic stone under the costume it goes in", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness
        db={db}
        init={{
          equipped: { top: item(100), garment: item(400) },
          enchants: { top: stone(1100) },
        }}
      >
        <Wishlist />
      </StateHarness>,
    );
    expect(screen.getByText("(3)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Lista de desejos/ }));
    const names = screen.getAllByRole("link", { name: /Chapéu A|Capa D|Pedra Gráfica/ });
    expect(names.map((n) => n.textContent)).toEqual([
      "Chapéu A",
      "Pedra Gráfica: Brilho (Topo)",
      "Capa D",
    ]);
    expect(screen.getByRole("link", { name: "Pedra Gráfica: Brilho (Topo)" })).toHaveAttribute(
      "href",
      expect.stringContaining("/database/item/1100/"),
    );
  });
});
