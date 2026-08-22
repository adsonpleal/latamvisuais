import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StateHarness } from "../test/StateHarness";
import { ClassSelect } from "./ClassSelect";

/** Open the picker and return its search box. */
async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Aprendiz/ }));
  return screen.getByRole("searchbox", { name: "Buscar classe…" });
}

describe("ClassSelect", () => {
  it("filters the list by name, ignoring case and accents", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <ClassSelect />
      </StateHarness>,
    );

    const search = await openPicker(user);
    // The fixture's Rune Knight is "Cavaleiro Rúnico" — typed without the accent.
    await user.type(search, "runico");

    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("option", { name: /Cavaleiro Rúnico/ })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /Musa/ })).toBeNull();
    // Group headings are dropped while a query is active.
    expect(list.querySelector(".class-group-label")).toBeNull();
  });

  it("also matches the job id", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <ClassSelect />
      </StateHarness>,
    );

    await user.type(await openPicker(user), "4021");
    expect(screen.getByRole("option", { name: /Musa/ })).toBeInTheDocument();
  });

  it("picks the class and closes", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <ClassSelect />
      </StateHarness>,
    );

    await user.type(await openPicker(user), "musa");
    await user.click(screen.getByRole("option", { name: /Musa/ }));

    expect(screen.getByRole("button", { name: /Musa/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter picks the class when the query leaves exactly one", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <ClassSelect />
      </StateHarness>,
    );

    await user.type(await openPicker(user), "musa{Enter}");
    expect(screen.getByRole("button", { name: /Musa/ })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <StateHarness>
        <ClassSelect />
      </StateHarness>,
    );

    await user.type(await openPicker(user), "zzzz");
    expect(screen.getByText("Nenhuma classe encontrada.")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
