import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StateHarness } from "../test/StateHarness";
import { AppearancePanel } from "./AppearancePanel";

describe("AppearancePanel", () => {
  it("hides the gender control for a gender-locked class", () => {
    // Musa (id 4021) is female-only. clampState has already forced the state to
    // female, so there is nothing left to choose — the control is dropped
    // rather than shown with one pill permanently disabled.
    render(
      <StateHarness init={{ classId: 4021 }}>
        <AppearancePanel />
      </StateHarness>,
    );

    expect(screen.queryByRole("button", { name: "Feminino" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Masculino" })).toBeNull();
    // The rest of the panel is unaffected.
    expect(screen.getByRole("button", { name: "Pele original" })).toBeInTheDocument();
  });

  it("leaves both genders selectable for an ordinary class", () => {
    render(
      <StateHarness>
        <AppearancePanel />
      </StateHarness>,
    );
    expect(screen.getByRole("button", { name: "Masculino" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Feminino" })).toBeEnabled();
  });

  it("offers the alternative outfit only for the classes that have one", () => {
    const { unmount } = render(
      <StateHarness>
        <AppearancePanel />
      </StateHarness>,
    );
    expect(screen.queryByRole("button", { name: "Alternativo" })).toBeNull();
    unmount();

    render(
      <StateHarness init={{ classId: 4054 }}>
        <AppearancePanel />
      </StateHarness>,
    );
    expect(screen.getByRole("button", { name: "Alternativo" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Original" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers four skin tones plus a custom colour, and moves the selection", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <AppearancePanel />
      </StateHarness>,
    );

    const original = screen.getByRole("button", { name: "Pele original" });
    expect(original).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tom 4" })).toHaveAttribute("aria-pressed", "false");
    // Tones 2-4 are pickable; tone 1 is the original, so it is the default.
    expect(screen.queryByRole("button", { name: "Tom 1" })).toBeNull();
    expect(screen.getByLabelText("Cor personalizada")).toHaveAttribute("type", "color");

    await user.click(screen.getByRole("button", { name: "Tom 3" }));
    expect(screen.getByRole("button", { name: "Tom 3" })).toHaveAttribute("aria-pressed", "true");
    expect(original).toHaveAttribute("aria-pressed", "false");
  });

  it("hides the skin tones for Doram, whose sprites ragassets can't tone", () => {
    render(
      <StateHarness init={{ classId: 4218 }}>
        <AppearancePanel />
      </StateHarness>,
    );
    expect(screen.queryByRole("button", { name: "Pele original" })).toBeNull();
    expect(screen.queryByLabelText("Cor personalizada")).toBeNull();
  });

  it("swaps in the outfit's own clothes colours when it is picked", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness init={{ classId: 4054 }}>
        <AppearancePanel />
      </StateHarness>,
    );

    // Two rows offer "Cor N" squares: hair (8 dyes) and clothes. Rune Knight
    // male has 5 clothes palettes normally — Padrão + Cor 1..4 — so "Cor 4"
    // appears in both rows…
    expect(screen.getAllByRole("button", { name: "Cor 4" })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Alternativo" }));
    // …and only 3 on the alternative outfit, leaving "Cor 4" to hair alone.
    expect(screen.getAllByRole("button", { name: "Cor 4" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Cor 2" })).toHaveLength(2);
  });

  it("defaults to the Padrão swatch and moves the selection on click", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <AppearancePanel />
      </StateHarness>,
    );

    // Two "Padrão" squares (hair + clothes), both selected by default.
    for (const padrao of screen.getAllByRole("button", { name: "Padrão" })) {
      expect(padrao).toHaveAttribute("aria-pressed", "true");
    }

    const color1 = screen.getAllByRole("button", { name: "Cor 1" })[0];
    await user.click(color1);
    expect(screen.getAllByRole("button", { name: "Cor 1" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
