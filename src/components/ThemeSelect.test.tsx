import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeSelect } from "./ThemeSelect";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => localStorage.clear());

describe("ThemeSelect", () => {
  it("defaults to Auto and applies the resolved scheme to <html>", () => {
    render(<ThemeSelect />);
    expect(screen.getByRole("combobox", { name: "Tema" })).toHaveValue("auto");
    // matchMedia is stubbed to light in test setup.
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("forces dark, persists the choice, and sets data-theme", async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);

    await user.selectOptions(screen.getByRole("combobox"), "Escuro");

    expect(screen.getByRole("combobox")).toHaveValue("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("clears storage when returning to Auto", async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);

    await user.selectOptions(screen.getByRole("combobox"), "Claro");
    expect(localStorage.getItem("theme")).toBe("light");

    await user.selectOptions(screen.getByRole("combobox"), "Auto");
    expect(localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
