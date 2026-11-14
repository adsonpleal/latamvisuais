// A `fetch` stub for the tests that exercise a loader end to end.
//
// Each of them wants the same two things: to answer the requests with canned
// bodies, and to assert on the URLs that were asked for — the ?v= cache-buster
// and which directory a bundle key resolves under are both contract, and a
// loader that quietly fetches the wrong path otherwise reads as a pass.
//
// Remember `vi.unstubAllGlobals()` in an afterEach; this only installs.

import { vi } from "vitest";

/** Install the stub. `answer` returns the body for a URL (anything falsy is a
 *  404, so a test can pin what a loader does when a document is missing); pass
 *  a plain object to answer everything with it. Returns the list the requested
 *  URLs are pushed onto, in order. */
export function stubFetch(answer: unknown | ((url: string) => unknown)): string[] {
  const seen: string[] = [];
  const bodyFor = typeof answer === "function" ? (answer as (url: string) => unknown) : () => answer;
  vi.stubGlobal("fetch", (url: string) => {
    seen.push(url);
    const body = bodyFor(url);
    if (body instanceof Error) return Promise.reject(body);
    if (!body) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  });
  return seen;
}
