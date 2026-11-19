// The four slot cards, and the graphic-stone line each one carries.
//
// The point of the second line is that it is a *separate* layer: the stone goes
// inside the costume, so clearing one must not touch the other, and a stone with
// no costume under it is a build the game can't produce and has to say so.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeDb } from "../test/fixtures";
import { StateHarness } from "../test/StateHarness";
import { Slots } from "./Slots";

const db = makeDb();
const item = (id: number) => db.costumes.find((c) => c.id === id)!;
const stone = (id: number) => db.stones.find((s) => s.id === id)!;

function renderSlots(init: Parameters<typeof StateHarness>[0]["init"] = {}, onPick = vi.fn()) {
  render(
    <StateHarness init={init}>
      <Slots onPick={onPick} />
    </StateHarness>,
  );
  return onPick;
}

/** The card for a position, found by its title. */
const card = (name: string) => screen.getByText(name).closest(".slot-card") as HTMLElement;

describe("Slots", () => {
  it("shows the costume and its stone on the same card", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    const top = card("Topo");
    expect(within(top).getByText("Chapéu A")).toBeInTheDocument();
    expect(within(top).getByText("Pedra Gráfica: Brilho (Topo)")).toBeInTheDocument();
  });

  it("says the stone line is empty when nothing is enchanted", () => {
    renderSlots({ equipped: { top: item(100) } });
    expect(within(card("Topo")).getByText("Sem pedra")).toBeInTheDocument();
  });

  it("removes the stone without taking the costume off", async () => {
    const user = userEvent.setup();
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });

    await user.click(within(card("Topo")).getByRole("button", { name: "Remover pedra" }));
    expect(within(card("Topo")).getByText("Sem pedra")).toBeInTheDocument();
    expect(within(card("Topo")).getByText("Chapéu A")).toBeInTheDocument();
  });

  it("removes the costume without taking the stone off", async () => {
    const user = userEvent.setup();
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });

    await user.click(within(card("Topo")).getByRole("button", { name: "Remover" }));
    expect(within(card("Topo")).getByText("Vazio")).toBeInTheDocument();
    expect(within(card("Topo")).getByText("Pedra Gráfica: Brilho (Topo)")).toBeInTheDocument();
  });

  it("asks the catalogue for the right list from each empty line", async () => {
    const user = userEvent.setup();
    const onPick = renderSlots();

    await user.click(within(card("Meio")).getByText("Vazio"));
    expect(onPick).toHaveBeenLastCalledWith("mid", "costume");

    await user.click(within(card("Meio")).getByText("Sem pedra"));
    expect(onPick).toHaveBeenLastCalledWith("mid", "stone");
  });

  // In game the stone is an enchant inside a visual, so a stone on an empty
  // position is a build that can't exist — flagged rather than shown as valid.
  it("flags a stone with no costume to sit in", () => {
    renderSlots({ enchants: { top: stone(1100) } });
    expect(card("Topo").querySelector(".slot-stone-warn")).not.toBeNull();
  });

  it("drops the flag once a costume fills the position", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    expect(card("Topo").querySelector(".slot-stone-warn")).toBeNull();
  });

  // Each of the three states as one word, with the full reason on hover. The
  // word matters more than the tooltip: hovering a note is not how anyone
  // discovers that a stone will never draw, so the card has to say it outright.
  it("says nothing at all for a stone that simply draws", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    expect(card("Topo").querySelector(".slot-stone-note")).toBeNull();
  });

  it("calls a drawable footprint a footprint, and says when it appears", () => {
    renderSlots({ equipped: { garment: item(400) }, enchants: { garment: stone(1400) } });
    const note = within(card("Capa")).getByText("pegada");
    expect(note).toHaveAttribute("data-tip", expect.stringMatching(/enquanto o personagem anda/));
  });

  it("says a stone with no effect bundle has no preview at all", () => {
    // 1300 is the fixture's keyless stone.
    renderSlots({ equipped: { low: item(300) }, enchants: { low: stone(1300) } });
    const note = within(card("Baixo")).getByText("sem prévia");
    expect(note).toHaveAttribute("data-tip", expect.stringMatching(/dentro do próprio programa|desenhado pelo próprio programa/));
  });

  // A footprint whose artwork isn't extracted yet is a different situation from
  // an effect the client keeps in its own code — same word, different reason.
  it("separates a footprint still waiting on its artwork from one nothing can draw", () => {
    renderSlots({ equipped: { garment: item(400) }, enchants: { garment: stone(1500) } });
    const note = within(card("Capa")).getByText("sem prévia");
    expect(note).toHaveAttribute("data-tip", expect.stringMatching(/ainda não foi extraído/));
  });

  // A stone the client draws itself (no .str, no bundle) still previews — the
  // card must not lump it in with the ones nothing can draw.
  it("treats a built-in effect as drawable", () => {
    renderSlots({ equipped: { mid: item(200) }, enchants: { mid: stone(1600) } });
    expect(card("Meio").querySelector(".slot-stone-note")).toBeNull();
  });

  // The grid tile carries a visible server badge; this card deliberately does
  // not. Four cards sit side by side on one row, so the name line has room for
  // a name and little else — a costume six servers have put three chips and an
  // ellipsis in front of it, reading as the item rather than as a note about
  // it. The names stay, in the tooltip the line already had.
  it("names the servers in the worn costume's tooltip, not on the card", () => {
    renderSlots({ equipped: { top: item(10400990) } });
    const top = card("Topo");
    expect(within(top).getByText("Chapéu de Dois Servidores")).toBeInTheDocument();
    expect(within(top).queryByText("iRO")).not.toBeInTheDocument();
    expect(within(top).queryByText("twRO")).not.toBeInTheDocument();
    expect(top.querySelector(".slot-name")).toHaveAttribute(
      "data-tip",
      expect.stringMatching(/Visual de outros servidores \(iRO e twRO\)/),
    );
  });

  it("leaves an ordinary costume's tooltip as its name and id", () => {
    renderSlots({ equipped: { top: item(100) } });
    expect(card("Topo").querySelector(".slot-name")).toHaveAttribute("data-tip", "Chapéu A (100)");
  });
});
