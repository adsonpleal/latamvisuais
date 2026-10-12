import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

function Picker() {
  const [value, setValue] = useState(1);
  return <Select label="Destino" value={value} onChange={setValue} options={[
    { value: 0, label: "Personagem 1" },
    { value: 1, label: "Personagem 2" },
    { value: 2, label: "Personagem 3" },
  ]} />;
}

describe("shared dropdown", () => {
  it("opens on the selected option without a search box and closes after picking", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const trigger = screen.getByRole("button", { name: "Destino" });
    await user.click(trigger);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("option", { name: "Personagem 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Personagem 2" })).toHaveFocus();
    await user.click(screen.getByRole("option", { name: "Personagem 3" }));
    expect(trigger).toHaveTextContent("Personagem 3");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("supports opening, navigating and selecting with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.tab();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Destino" })).toHaveTextContent("Personagem 3");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape and restores focus without changing the selection", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const trigger = screen.getByRole("button", { name: "Destino" });
    await user.click(trigger);
    await user.keyboard("{ArrowUp}{Escape}");
    expect(trigger).toHaveTextContent("Personagem 2");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    render(<><Picker /><button>Fora</button></>);
    await user.click(screen.getByRole("button", { name: "Destino" }));
    await user.click(screen.getByRole("button", { name: "Fora" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Fora" })).toHaveFocus();
  });
});
