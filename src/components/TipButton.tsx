// A <button> wired to the shared tooltip (via [data-tip], see useTooltip) plus
// a matching aria-label. The old imperative UI's `tipButton()` helper.

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tip: string };

export function TipButton({ tip, type = "button", ...rest }: Props) {
  return <button type={type} data-tip={tip} aria-label={tip} {...rest} />;
}
