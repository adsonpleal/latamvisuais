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
