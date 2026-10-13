import { Suspense, useState } from "react";
import { Header } from "./Header";
import { Jobs } from "./Jobs";
import { OrderDetail } from "./orders/OrderDetail";
import { OrdersBoard } from "./orders/OrdersBoard";
import { Products } from "./Products";
import type { Order } from "./vantage.gen";

export function App({ onSignOut }: { onSignOut: () => void }) {
  const [selected, setSelected] = useState<Order | null>(null);
  return (
    <div className="app">
      <Header onSignOut={onSignOut} />
      <main>
        <OrdersBoard onOpen={setSelected} />
        <aside>
          {selected ? (
            <Suspense fallback={<section className="detail">Loading order…</section>}>
              <OrderDetail order={selected} onClose={() => setSelected(null)} />
            </Suspense>
          ) : (
            <Products />
          )}
        </aside>
      </main>
      <Jobs />
    </div>
  );
}
