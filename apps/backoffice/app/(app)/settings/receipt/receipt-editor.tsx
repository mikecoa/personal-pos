"use client";
import { useState } from "react";
import { formatRupiah, rp } from "@pos/core";
import { Card, Field, TextArea, Toggle } from "@/components/ui";

type Profile = { header_name: string; address: string | null; phone: string | null; social: string | null; footer: string | null; show_server: boolean; show_cashier: boolean };

const SAMPLE = [
  { name: "Kopi Susu", qty: 2, price: 18000, mods: ["Dingin"] },
  { name: "Nasi Goreng Ayam", qty: 1, price: 28000, mods: ["Pedas"] },
];

export function ReceiptEditor({ initial }: { initial: Profile }) {
  const [p, setP] = useState(initial);
  const set = (k: keyof Profile) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setP({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const total = SAMPLE.reduce((s, i) => s + i.qty * i.price, 0);
  const line = "border-t border-dashed border-ink/25";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Receipt details">
        <div className="space-y-4">
          <Field label="Business name on receipt" name="header_name" value={p.header_name} onChange={set("header_name")} required maxLength={60} />
          <TextArea label="Address" name="address" value={p.address ?? ""} onChange={set("address")} maxLength={200} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" name="phone" value={p.phone ?? ""} onChange={set("phone")} maxLength={40} />
            <Field label="Instagram / website" name="social" value={p.social ?? ""} onChange={set("social")} maxLength={80} />
          </div>
          <TextArea label="Footer message" name="footer" value={p.footer ?? ""} onChange={set("footer")} maxLength={200} />
          <Toggle label="Show who served" name="show_server" checked={p.show_server} onChange={set("show_server")} />
          <Toggle label="Show cashier" name="show_cashier" checked={p.show_cashier} onChange={set("show_cashier")} />
        </div>
      </Card>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium text-ink-2">Preview (58 mm)</p>
        <div className="mx-auto w-[280px] bg-white px-4 py-5 font-mono text-[11px] leading-snug text-[#222] shadow-md" aria-label="Receipt preview">
          <p className="text-center text-sm font-bold">{p.header_name || "Business name"}</p>
          {p.address && <p className="text-center whitespace-pre-line">{p.address}</p>}
          {p.phone && <p className="text-center">{p.phone}</p>}
          <div className={`my-2 ${line}`} />
          <div className="flex justify-between"><span>21 Nov 2026</span><span>19:42</span></div>
          <div className="flex justify-between"><span>Receipt</span><span>A7-000123</span></div>
          {p.show_server && <div className="flex justify-between"><span>Served by</span><span>Ani</span></div>}
          {p.show_cashier && <div className="flex justify-between"><span>Cashier</span><span>Budi</span></div>}
          <div className={`my-2 ${line}`} />
          <p className="text-center font-bold">Dine In</p>
          {SAMPLE.map((i) => (
            <div key={i.name} className="mt-1">
              <div className="flex justify-between"><span>{i.name}</span><span>{formatRupiah(rp(i.qty * i.price))}</span></div>
              <div className="pl-2 text-[#666]">{i.qty} x {formatRupiah(rp(i.price))}{i.mods.length ? ` · ${i.mods.join(", ")}` : ""}</div>
            </div>
          ))}
          <div className={`my-2 ${line}`} />
          <div className="flex justify-between font-bold"><span>Total</span><span>{formatRupiah(rp(total))}</span></div>
          <div className="flex justify-between"><span>QRIS</span><span>{formatRupiah(rp(total))}</span></div>
          <div className={`my-2 ${line}`} />
          {p.social && <p className="text-center">{p.social}</p>}
          {p.footer && <p className="mt-1 text-center whitespace-pre-line">{p.footer}</p>}
        </div>
      </div>
    </div>
  );
}
