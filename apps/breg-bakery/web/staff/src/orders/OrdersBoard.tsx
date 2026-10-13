import { observer } from "@vantage-ui/client/react";
import { useDb } from "../db";
import type { Order, OrderFields } from "../vantage.gen";
import { OrderCard } from "./OrderCard";

type Status = NonNullable<OrderFields["status"]>;
const LANES: { title: string; status: Status | Status[] }[] = [
  { title: "Placed", status: "placed" },
  { title: "Confirmed", status: "confirmed" },
  { title: "In production", status: "in_production" },
  { title: "Ready", status: "ready" },
  { title: "Done", status: ["delivered", "picked_up"] },
  { title: "Cancelled", status: "cancelled" },
];

export function OrdersBoard({ onOpen }: { onOpen: (o: Order) => void }) {
  return (
    <section className="board">
      <h2>
        Orders <small>each lane is a live server-side collection</small>
      </h2>
      <div className="lanes">
        {LANES.map((lane) => (
          <Lane key={lane.title} {...lane} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

const Lane = observer(function Lane({ title, status, onOpen }: { title: string; status: Status | Status[]; onOpen: (o: Order) => void }) {
  // A filtered, sorted, windowed collection. The server keeps its membership
  // current: confirm an order and it moves lanes in every open tab.
  const orders = useDb().order.where({ status }).sort("created_at", "desc").limit(12);
  return (
    <div className="lane">
      <h3>
        {title} <span>{orders.loadState === "loading" ? "…" : `${orders.length}${orders.totalExact ? "" : "+"}`}</span>
      </h3>
      {orders.error && <div className="error">{orders.error}</div>}
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} onOpen={onOpen} />
      ))}
    </div>
  );
});
