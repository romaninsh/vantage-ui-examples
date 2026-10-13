// Atlaskit breadcrumbs whose links go through the router.
import { useNavigate } from "react-router";
import Breadcrumbs, { BreadcrumbsItem } from "@atlaskit/breadcrumbs";

export type Crumb = { text: string; to: string };

export function Crumbs({ items }: { items: Crumb[] }) {
  const navigate = useNavigate();
  return (
    <Breadcrumbs>
      {items.map((c) => (
        <BreadcrumbsItem
          key={c.to}
          text={c.text}
          href={c.to}
          onClick={(e) => {
            e.preventDefault();
            navigate(c.to);
          }}
        />
      ))}
    </Breadcrumbs>
  );
}
