import { useState } from "react";
import { observer, useServo } from "@vantage-ui/client/react";
import { useDb } from "./db";
import type { Product } from "./vantage.gen";

export const Products = observer(function Products() {
  const db = useDb();
  const bakeries = db.bakery.all; // `instant`: loaded at connect, always synchronous
  const [shop, setShop] = useState<string | null>(null);
  const bakery = db.bakery.get(shop ?? bakeries.elements[0]?.id ?? "");
  const products = bakery?.products.sort("stock", "asc").limit(40);
  return (
    <section className="products">
      <h2>
        Products{" "}
        <select value={bakery?.id ?? ""} onChange={(e) => setShop(e.target.value)}>
          {bakeries.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Stock</th>
            <th>Price £</th>
          </tr>
        </thead>
        <tbody>
          {products?.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
        </tbody>
      </table>
      {products?.error && <div className="error">{products.error}</div>}
    </section>
  );
});

const ProductRow = observer(function ProductRow({ product }: { product: Product }) {
  // A draft per row: typing doesn't touch the shared record until $flash().
  const draft = useServo(product);
  const [text, setText] = useState<string | null>(null);
  return (
    <tr className={product.$status}>
      <td>{product.name}</td>
      <td className={(product.stock ?? 0) < 10 ? "low" : ""} key={product.stock ?? 0}>
        {product.stock}
      </td>
      <td>
        <input
          value={text ?? ((product.price ?? 0) / 100).toFixed(2)}
          onChange={(e) => setText(e.target.value)}
          onBlur={async () => {
            if (text == null) return;
            draft.price = Math.round(Number(text) * 100);
            setText(null);
            await draft.$flash();
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {product.$errors.price && <span className="error">{product.$errors.price}</span>}
      </td>
    </tr>
  );
});
