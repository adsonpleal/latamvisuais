// A <button> wired to the shared tooltip (via [data-tip], see useTooltip) plus
// a matching aria-label. The old imperative UI's `tipButton()` helper.

import type { ComponentProps } from "react";

// ComponentProps rather than ButtonHTMLAttributes so `ref` passes through
// (React 19 treats it as an ordinary prop) — the flashed hints need to anchor
// on the button they point at.
type Props = ComponentProps<"button"> & { tip: string };

export function TipButton({ tip, type = "button", ...rest }: Props) {
  return <button type={type} data-tip={tip} aria-label={tip} {...rest} />;
}
