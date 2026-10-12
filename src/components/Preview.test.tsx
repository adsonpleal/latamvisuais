import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StateHarness } from "../test/StateHarness";
import { Preview } from "./Preview";

vi.mock("../hooks/useFrameCount", () => ({ useFrameCount: () => null }));
vi.mock("../hooks/usePreloadedImage", () => ({
  usePreloadedImage: (src: string) => ({ src, error: false }),
}));

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterAll(() => vi.unstubAllGlobals());

describe("Preview flight control", () => {
  it.each([4047, 4239, 4302])("offers flight beside riding for class %i", async (classId) => {
    const user = userEvent.setup();
    render(<StateHarness init={{ classId }}><Preview onPlay={() => {}} /></StateHarness>);

    const flight = screen.getByRole("switch", { name: "Voo" });
    const mount = screen.getByRole("switch", { name: "Montar" });
    expect(flight).toHaveAttribute("aria-checked", "false");
    expect(mount.closest(".body-options")).toContainElement(flight);

    await user.click(mount);
    expect(mount).toHaveAttribute("aria-checked", "true");
    await user.click(flight);
    expect(flight).toHaveAttribute("aria-checked", "true");
    expect(mount).toHaveAttribute("aria-checked", "false");

    // Native switch keyboard behavior, including turning flight back off.
    await user.keyboard(" ");
    expect(flight).toHaveAttribute("aria-checked", "false");
    await user.click(flight);
    await user.click(mount);
    expect(flight).toHaveAttribute("aria-checked", "false");
    expect(mount).toHaveAttribute("aria-checked", "true");
  });

  it("hides flight for other classes", () => {
    render(<StateHarness><Preview onPlay={() => {}} /></StateHarness>);
    expect(screen.queryByRole("switch", { name: "Voo" })).toBeNull();
  });
});
