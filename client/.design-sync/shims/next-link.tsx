/* design-sync shim: next/link -> plain <a>. */
import React from "react";

export interface ShimLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}

export default function Link({ prefetch: _p, replace: _r, scroll: _s, ...rest }: ShimLinkProps) {
  return <a {...rest} />;
}
