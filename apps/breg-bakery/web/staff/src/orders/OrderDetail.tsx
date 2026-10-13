import { observer, useHydrated } from "@vantage-ui/client/react";
import type { Order } from "../vantage.gen";

export const OrderDetail = observer(function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  // Suspends until both references are loaded; then `.value` is non-optional.
  const o = useHydrated(order, ["client", "invoice"]);
  const client = o.client.value;
  return (
    <section className="detail">
      <h2>
        Order <small>{o.id}</small> <button onClick={onClose}>✕</button>
      </h2>
      <dl>
        <dt>Status</dt>
        <dd>{o.status}</dd>
        <dt>Shop</dt>
        <dd>{o.bakery.value?.name}</dd>
        <dt>Client</dt>
        <dd>
          {client?.name} <small>{client?.email}</small>
        </dd>
        <dt>Client balance</dt>
        <dd>£{((client?.balance ?? 0) / 100).toFixed(2)}</dd>
        <dt>Invoice</dt>
        <dd>{o.invoice.value ? `${o.invoice.value.number} · ${o.invoice.value.settlement ?? o.invoice.value.status}` : "not invoiced"}</dd>
      </dl>
      {(o.client.error || o.invoice.error) && <div className="error">{o.client.error ?? o.invoice.error}</div>}
    </section>
  );
});
