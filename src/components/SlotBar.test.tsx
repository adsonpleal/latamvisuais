import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SlotBar } from "./SlotBar";

describe("SlotBar", () => {
  it("renders count buttons and marks the active one pressed", () => {
    render(<SlotBar active={2} count={6} onSelect={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(buttons[2]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelect with the zero-based index on click", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SlotBar active={0} count={6} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /Personagem 3/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("switches with Alt + number", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SlotBar active={0} count={6} onSelect={onSelect} />);
    await user.keyboard("{Alt>}4{/Alt}");
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("ignores Alt + number beyond the slot count", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SlotBar active={0} count={6} onSelect={onSelect} />);
    await user.keyboard("{Alt>}9{/Alt}");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
