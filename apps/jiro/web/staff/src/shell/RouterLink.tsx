// The link Atlaskit components render (through AppProvider), mapped onto
// react-router so navigation items don't reload the page.
import { forwardRef } from "react";
import { Link } from "react-router";
import type { RouterLinkComponentProps } from "@atlaskit/app-provider";

export const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkComponentProps>(function RouterLink({ href, children, ...rest }, ref) {
  return (
    <Link ref={ref} to={href} {...rest}>
      {children}
    </Link>
  );
});
