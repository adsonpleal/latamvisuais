import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "../test/fixtures";
import { StateHarness } from "../test/StateHarness";
import { Wishlist } from "./Wishlist";

const db = makeDb();
const item = (id: number) => db.costumes.find((c) => c.id === id)!;

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
    expect(market).toHaveAttribute("href", expect.stringContaining("serverType=FREYA"));

    await user.selectOptions(screen.getByRole("combobox"), "NIDHOGG");
    expect(localStorage.getItem("latamvisuais.server")).toBe("NIDHOGG");
    expect(screen.getAllByRole("link", { name: "Buscar no mercado" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("serverType=NIDHOGG"),
    );
  });
});
