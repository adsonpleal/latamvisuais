// Vitest global setup: extends `expect` with jest-dom matchers and cleans up
// the React DOM between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
