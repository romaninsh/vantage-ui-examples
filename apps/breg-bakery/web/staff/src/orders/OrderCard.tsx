import { useState } from "react";
import { observer, useAction, usePreloadOnIntent } from "@vantage-ui/client/react";
import { ago } from "../format";
import type { Order, OrderAction } from "../vantage.gen";

const LABELS: Record<OrderAction, string> = {
  mark_confirmed: "Confirm",
  start_production: "Start",
  mark_ready: "Ready",
  mark_delivered: "Delivered",
  mark_picked_up: "Picked up",
  cancel_order: "Cancel…",
};

export const OrderCard = observer(function OrderCard({ order, onOpen }: { order: Order; onOpen: (o: Order) => void }) {
  const run = useAction((name: Exclude<OrderAction, "cancel_order">) => order[name]());
  const [cancelling, setCancelling] = useState(false);
  // Resting on a card starts loading what the detail panel shows.
  const intent = usePreloadOnIntent(() => order.hydrate(["client", "invoice"]));
  return (
    <div className={`card ${order.$status}`} key={order.status} {...intent}>
      {/* A lazy reference: the client record loads on first read. */}
      <div className="who" onClick={() => onOpen(order)}>
        {order.client.value?.name ?? order["client.name"] ?? "…"}
      </div>
      <div className="where">
        {order["bakery.name"]?.replace(/^Breg /, "").split(",")[0]} · {ago(order.created_at)}
      </div>
      {order.cancellation_reason && <div className="note">✕ {order.cancellation_reason.replaceAll("_", " ")}</div>}
      {cancelling ? (
        <CancelForm order={order} onDone={() => setCancelling(false)} />
      ) : (
        <div className="actions">
          {/* `$actions`: what the server's `when:` rules allow for this row now. */}
          {order.$actions.map((name) => (
            <button key={name} disabled={run.pending} onClick={() => (name === "cancel_order" ? setCancelling(true) : run.run(name))}>
              {LABELS[name]}
            </button>
          ))}
        </div>
      )}
      {run.error && <div className="error">{run.error.message}</div>}
    </div>
  );
});

type Reason = Parameters<Order["cancel_order"]>[0]["reason"];

function CancelForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const [reason, setReason] = useState<Reason>("customer_request");
  const cancel = useAction(() => order.cancel_order({ reason, note: "from the web" }));
  return (
    <div className="actions">
      <select value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
        {(["customer_request", "payment_failed", "out_of_stock", "other"] as const).map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button className="danger" disabled={cancel.pending} onClick={async () => (await cancel.run()).ok && onDone()}>
        Cancel order
      </button>
      <button onClick={onDone}>Keep</button>
      {cancel.error && <div className="error">{cancel.error.message}</div>}
    </div>
  );
}
