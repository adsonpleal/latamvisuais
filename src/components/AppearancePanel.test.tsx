import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StateHarness } from "../test/StateHarness";
import { AppearancePanel } from "./AppearancePanel";

describe("AppearancePanel", () => {
  it("locks gender for a gender-locked class", () => {
    // Musa (id 4021) is female-only; clampState forces female and the male
    // pill is disabled.
    render(
      <StateHarness init={{ classId: 4021 }}>
        <AppearancePanel />
      </StateHarness>,
    );

    expect(screen.getByRole("button", { name: "Feminino" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Masculino" })).toBeDisabled();
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
