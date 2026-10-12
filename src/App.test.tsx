import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { buildOf, initialState, type Build, type State } from "./core/state";
import { loadSlots, saveSlots, SLOT_COUNT } from "./core/slots";
import { encodeState } from "./core/url";
import { makeDb } from "./test/fixtures";

vi.mock("./hooks/useLoadDb", async () => {
  const { makeDb } = await import("./test/fixtures");
  const db = makeDb();
  return { useLoadDb: () => ({ status: "ready", db }) };
});

// Keep the real appearance, catalogue, slot controls and persistence together;
// only the renderer is replaced so these tests need no network or WebGL.
vi.mock("./components/Preview", async () => {
  const { useDispatch } = await import("./state/AppStateContext");
  return {
    Preview: () => {
      const dispatch = useDispatch();
      return <button onClick={() => dispatch({ type: "rotateBody", delta: 1 })}>Girar corpo</button>;
    },
  };
});

const db = makeDb();
const defaults = initialState(db);
const saved: State = { ...defaults, classId: 4054, hairStyle: 2 };
const linked: State = { ...defaults, gender: "f", hairStyle: 2 };
const storageKey = "latamvisuais.slots";

function seed(builds: (Build | null)[] = [null, buildOf(saved)], active = 1) {
  saveSlots({ builds: Array.from({ length: SLOT_COUNT }, (_, i) => builds[i] ?? null), active });
}

function visit(state?: State) {
  history.replaceState(null, "", state ? `/?b=${encodeState(state)}` : "/");
  return render(<StrictMode><App /></StrictMode>);
}

const slot = (number: number) => screen.getByRole("button", { name: `Personagem ${number} (Alt+${number})` });
const preview = () => screen.getByRole("region", { name: "Visual do link" });

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
});

describe("saved characters and shared links", () => {
  it("keeps the latest saved character after opening an older link, editing it and returning", async () => {
    const user = userEvent.setup();
    seed();
    const before = localStorage.getItem(storageKey);
    const page = visit(linked);

    expect(localStorage.getItem(storageKey)).toBe(before);
    expect(preview()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feminino" })).toHaveAttribute("aria-pressed", "true");
    expect(slot(2)).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Girar corpo" }));
    await user.click(screen.getByRole("button", { name: "Estilo 1" }));
    expect(localStorage.getItem(storageKey)).toBe(before);

    page.unmount();
    const refreshed = render(<StrictMode><App /></StrictMode>);
    expect(preview()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estilo 1" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(storageKey)).toBe(before);
    refreshed.unmount();
    visit();
    expect(slot(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Cavaleiro Rúnico/ })).toBeInTheDocument();
    expect(loadSlots(db).builds[1]).toEqual(buildOf(saved));
  });

  it("restores the remembered slot when its number is clicked from a link preview", async () => {
    const user = userEvent.setup();
    seed();
    visit(linked);

    await user.click(slot(2));
    expect(screen.queryByRole("region", { name: "Visual do link" })).toBeNull();
    expect(slot(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Cavaleiro Rúnico/ })).toBeInTheDocument();
    expect(loadSlots(db).builds[1]).toEqual(buildOf(saved));
  });

  it("saves a link into an empty slot only on request, then resumes autosaving", async () => {
    const user = userEvent.setup();
    seed();
    visit(linked);

    expect(within(preview()).getByRole("combobox")).toHaveValue("0");
    await user.click(screen.getByRole("button", { name: "Estilo 1" }));
    await user.click(within(preview()).getByRole("button", { name: "Salvar" }));

    expect(screen.queryByRole("region", { name: "Visual do link" })).toBeNull();
    expect(slot(1)).toHaveAttribute("aria-pressed", "true");
    expect(loadSlots(db).builds[0]).toEqual(buildOf({ ...linked, hairStyle: 1 }));
    expect(loadSlots(db).builds[1]).toEqual(buildOf(saved));

    await user.click(screen.getByRole("button", { name: "Masculino" }));
    expect(loadSlots(db).builds[0]?.gender).toBe("m");
  });

  it("requires an explicit replacement when all slots are occupied", async () => {
    const user = userEvent.setup();
    const builds = Array.from({ length: SLOT_COUNT }, (_, hairColor) => buildOf({ ...saved, hairColor }));
    seed(builds, 2);
    const before = localStorage.getItem(storageKey);
    visit(linked);

    expect(within(preview()).getByRole("combobox")).toHaveValue("2");
    expect(localStorage.getItem(storageKey)).toBe(before);
    await user.selectOptions(within(preview()).getByRole("combobox"), "4");
    expect(localStorage.getItem(storageKey)).toBe(before);
    await user.click(within(preview()).getByRole("button", { name: "Substituir" }));

    const stored = loadSlots(db);
    expect(stored.active).toBe(4);
    expect(stored.builds[4]).toEqual(buildOf(linked));
    expect(stored.builds.filter((_, i) => i !== 4)).toEqual(builds.filter((_, i) => i !== 4));
  });

  it("does not inherit costumes, stones or a pet omitted from a shared link", () => {
    seed([null, buildOf({
      ...saved,
      equipped: { top: db.costumes[0] },
      enchants: { top: db.stones[0] },
      pet: 1002,
    })]);
    visit(linked);

    expect(preview()).toBeInTheDocument();
    expect(screen.getAllByText("Vazio")).toHaveLength(4);
    expect(screen.getAllByText("Sem pedra")).toHaveLength(4);
    expect(new URLSearchParams(location.search).get("b")).toBe(encodeState(linked));
  });

  it("treats a cleared slot as an empty destination for a shared character", () => {
    seed([buildOf(defaults), buildOf(saved)]);
    visit(linked);
    expect(within(preview()).getByRole("combobox")).toHaveValue("0");
    expect(within(preview()).getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });

  it("keeps autosaving on refresh when the link matches the active slot, including duplicate slots", async () => {
    const user = userEvent.setup();
    seed([buildOf(saved), buildOf(saved)]);
    visit({ ...saved, action: 2, bodyDir: 3 });

    expect(screen.queryByRole("region", { name: "Visual do link" })).toBeNull();
    expect(slot(2)).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Estilo 1" }));
    expect(loadSlots(db).builds[1]?.hairStyle).toBe(1);
    expect(loadSlots(db).builds[0]).toEqual(buildOf(saved));
  });

  it("opens the matching saved slot when a link belongs to a different character", () => {
    seed([buildOf(linked), buildOf(saved)]);
    visit({ ...linked, bodyDir: 4 });

    expect(screen.queryByRole("region", { name: "Visual do link" })).toBeNull();
    expect(slot(1)).toHaveAttribute("aria-pressed", "true");
    expect(loadSlots(db).active).toBe(0);
    expect(loadSlots(db).builds[1]).toEqual(buildOf(saved));
  });

  it("preserves normal autosaving, slot switching and returning through the base URL", async () => {
    const user = userEvent.setup();
    seed();
    const page = visit();
    await user.click(screen.getByRole("button", { name: "Estilo 1" }));
    await user.click(slot(3));
    await user.click(screen.getByRole("button", { name: "Feminino" }));

    page.unmount();
    visit();
    expect(slot(3)).toHaveAttribute("aria-pressed", "true");
    expect(loadSlots(db).builds[2]?.gender).toBe("f");
    await user.click(slot(2));
    expect(loadSlots(db).builds[1]).toEqual(buildOf({ ...saved, hairStyle: 1 }));
  });

  it("ignores an unsupported link version and restores the saved character", () => {
    seed();
    history.replaceState(null, "", "/?b=2.0.0.1.0.0");
    render(<StrictMode><App /></StrictMode>);
    expect(screen.queryByRole("region", { name: "Visual do link" })).toBeNull();
    expect(slot(2)).toHaveAttribute("aria-pressed", "true");
    expect(loadSlots(db).builds[1]).toEqual(buildOf(saved));
  });

  it("previews a shared link on a first visit without saving it automatically", () => {
    visit(linked);
    expect(preview()).toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
