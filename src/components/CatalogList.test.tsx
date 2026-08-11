// The list view mounts only the rows near the viewport (see CatalogList's
// header). These tests own the geometry jsdom doesn't provide — the scroller's
// height and scroll offset — so the window arithmetic itself is what's checked.

import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db, Slot } from "../core/db";
import { makeDb } from "../test/fixtures";
import { StateHarness } from "../test/StateHarness";
import { Catalog } from "./Catalog";

/** The component's fallback pitch: jsdom lays nothing out, so its measurement
 *  (the distance between two rows) can't run and the default stands. */
const PITCH = 64;
const VIEWPORT = 320;
const COUNT = 60;

const db: Db = {
  ...makeDb(),
  costumes: Array.from({ length: COUNT }, (_, i) => ({
    id: 1000 + i,
    name: `Visual ${i}`,
    view: i,
    slots: ["top"] as Slot[],
  })),
};

function CatalogHost() {
  const [slotFilter, setSlotFilter] = useState<Slot | null>(null);
  return <Catalog slotFilter={slotFilter} onSlotFilterChange={setSlotFilter} pickSignal={0} />;
}

/** The scroller, with the layout jsdom won't compute. */
function scroller(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".catalog-list")!;
  Object.defineProperty(el, "clientHeight", { value: VIEWPORT, configurable: true });
  return el;
}

const scrollTo = async (px: number) => {
  const el = scroller();
  el.scrollTop = px;
  fireEvent.scroll(el);
  await waitFor(() => expect(rowNames()[0]).not.toBe("Visual 0"));
};

const rowNames = () =>
  [...document.querySelectorAll(".catalog-row-name")].map((n) => n.textContent);

const spacers = () =>
  [...document.querySelectorAll<HTMLElement>(".catalog-list > [aria-hidden]")].map((s) =>
    parseInt(s.style.height, 10),
  );

beforeEach(() => {
  localStorage.setItem("latamvisuais.catalogView", "list");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ prices: [], missing: [] }) }) as Response),
  );
  render(
    <StateHarness db={db}>
      <CatalogHost />
    </StateHarness>,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("CatalogList windowing", () => {
  // First on purpose: prices are cached per id for the session, so this is the
  // render that can still be seen asking for them.
  it("asks for prices only in the chunk the window sits in", async () => {
    await scrollTo(20 * PITCH);

    const asked = (fetch as ReturnType<typeof vi.fn>).mock.calls.flatMap(([url]) =>
      new URL(url as string).searchParams.get("items")!.split(",").map(Number),
    );
    // The 60 fixtures are one chunk, so the ids stay inside it — what's pinned
    // here is that the request is bounded by the chunk, not by the catalogue.
    expect(asked.length).toBeLessThanOrEqual(100);
    expect(asked).toContain(1020);
  });

  it("mounts a screenful plus slack, not the whole catalogue", async () => {
    fireEvent.scroll(scroller());
    // ceil(320 / 64) = 5 on screen, plus 4 of overscan either side.
    await waitFor(() => expect(rowNames()).toHaveLength(13));
    expect(rowNames()[0]).toBe("Visual 0");
    expect(screen.queryByText("Visual 40")).not.toBeInTheDocument();
  });

  it("keeps the scroll extent of the full list in the spacers", async () => {
    fireEvent.scroll(scroller());
    await waitFor(() => expect(rowNames()).toHaveLength(13));
    // Nothing above the window yet; everything below it stands as height.
    expect(spacers()).toEqual([0, (COUNT - 13) * PITCH]);
  });

  it("moves the window with the scroll, and pads for the rows above", async () => {
    await scrollTo(20 * PITCH);

    // Row 20 is at the top of the viewport, so the window starts 4 rows earlier.
    expect(rowNames()[0]).toBe("Visual 16");
    expect(rowNames()).toHaveLength(13);
    expect(screen.queryByText("Visual 0")).not.toBeInTheDocument();
    expect(spacers()).toEqual([16 * PITCH, (COUNT - 29) * PITCH]);
  });

  it("shows the last rows at the bottom, with nothing left to pad", async () => {
    await scrollTo(COUNT * PITCH);

    expect(rowNames().at(-1)).toBe(`Visual ${COUNT - 1}`);
    expect(spacers()[1]).toBe(0);
  });
});
