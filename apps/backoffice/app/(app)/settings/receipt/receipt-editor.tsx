"use client";
import { useMemo, useState, type ReactNode } from "react";
import { NO_TAX, priceCart, type PricingSettings } from "@pos/core";
import { Card, Field, TextArea, Toggle } from "@/components/ui";

type Profile = { header_name: string; address: string | null; phone: string | null; social: string | null; footer: string | null; show_server: boolean; show_cashier: boolean };
type Settings = {
  tax_enabled: boolean; tax_name: string; tax_rate_bp: number; gratuity_enabled: boolean; gratuity_name: string; gratuity_rate_bp: number;
  prices_include_tax: boolean; tax_after_discount: boolean; rounding_enabled: boolean; rounding_unit: number; rounding_mode: string;
};
type Discount = { name: string; kind: "percent" | "amount"; value: number };

/** A small sample bill from the café's own menu, priced with this location's real checkout settings. */
const SAMPLE = [
  { id: "a", name: "Kopi Susu", qty: 2, price: 18000, mods: [{ set: "Suhu", option: "Dingin", price: 0 }] },
  { id: "b", name: "Nasi Goreng Ayam", qty: 1, price: 25000, mods: [{ set: "Tingkat Kepedasan", option: "Pedas", price: 0 }] },
  { id: "c", name: "Roti Bakar Srikaya/Cokelat", qty: 1, price: 23000, mods: [{ set: "Rasa", option: "Srikaya", price: 0 }] },
];

const rp = (n: number) => `Rp. ${Math.abs(n).toLocaleString("id-ID")}`;
const pct = (bp: number) => `${(bp / 100).toLocaleString("id-ID")} %`;

export function ReceiptEditor({ initial, logo, settings, discount }: {
  initial: Profile; logo: string | null; settings: Settings | null; discount: Discount | null;
}) {
  const [p, setP] = useState(initial);
  const set = (k: keyof Profile) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setP({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const s: PricingSettings = settings ? {
    taxEnabled: settings.tax_enabled, taxRateBp: settings.tax_rate_bp, gratuityEnabled: settings.gratuity_enabled, gratuityRateBp: settings.gratuity_rate_bp,
    pricesIncludeTax: settings.prices_include_tax, taxAfterDiscount: settings.tax_after_discount, roundingEnabled: settings.rounding_enabled,
    roundingUnit: settings.rounding_unit, roundingMode: settings.rounding_mode as PricingSettings["roundingMode"],
  } : NO_TAX;
  const bill = useMemo(() => priceCart(
    SAMPLE.map((i) => ({ id: i.id, unitPrice: i.price, qty: i.qty, modifiers: i.mods })),
    discount ? [{ name: discount.name, kind: discount.kind, value: discount.value }] : [], s,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [discount, settings]);
  const cash = Math.ceil(bill.total / 50000) * 50000 || bill.total;
  const now = new Date();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <Card title="Receipt details">
        <div className="space-y-4">
          <Field label="Business name on receipt" name="header_name" value={p.header_name} onChange={set("header_name")} required maxLength={60} />
          <TextArea label="Address" name="address" value={p.address ?? ""} onChange={set("address")} maxLength={200} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" name="phone" value={p.phone ?? ""} onChange={set("phone")} maxLength={40} />
            <Field label="Instagram / website" name="social" value={p.social ?? ""} onChange={set("social")} maxLength={80} />
          </div>
          <TextArea label="Note at the bottom" name="footer" value={p.footer ?? ""} onChange={set("footer")} maxLength={200} />
          <Toggle label="Show who served" name="show_server" checked={p.show_server} onChange={set("show_server")} />
          <Toggle label="Show who collected payment" name="show_cashier" checked={p.show_cashier} onChange={set("show_cashier")} />
          <p className="text-sm text-ink-2">The logo comes from <a href="/settings/locations" className="font-medium text-accent hover:underline">Locations</a>. Tax, service charge and rounding come from <a href="/settings/checkout" className="font-medium text-accent hover:underline">Checkout</a>.</p>
        </div>
      </Card>

      {/* Preview, laid out like the receipt Moka shows. */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-xs font-semibold tracking-[0.06em] text-ink-2">RECEIPT PREVIEW</p>
        <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
          <div aria-label="Receipt preview" className="anim-fade rounded-lg bg-white px-6 py-7 text-[13px] leading-snug text-[#2b2b2b] shadow-[0_1px_3px_rgba(1,33,51,0.08)]">
            <header className="text-center">
              {logo && <img src={logo} alt="" className="mx-auto mb-3 h-24 w-24 rounded-full bg-[#e9dcc4] object-contain p-1" />}
              <p className="text-[20px] font-bold leading-tight text-[#222]">{p.header_name || "Business name"}</p>
              {p.address && <p className="mt-2 whitespace-pre-line text-[12.5px] text-[#555]">{p.address}</p>}
              {p.phone && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-[#555]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
                  {p.phone}
                </p>
              )}
            </header>

            <Rule />
            <Row l={now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} r={now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} />
            <Row l="Receipt Number" r="A7-000123" />
            {p.show_server && <Row l="Served By" r="Ani" />}
            {p.show_cashier && <Row l="Collected By" r="Budi" />}
            <Rule />

            <div className="space-y-2">
              {SAMPLE.map((i) => (
                <div key={i.id}>
                  <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6">
                    <span className="font-medium text-[#222]">{i.name}</span>
                    <span className="w-8 text-center text-[#555]">×{i.qty}</span>
                    <span className="text-right tabular-nums">{rp(i.qty * i.price)}</span>
                  </div>
                  {i.mods.map((m) => (
                    <p key={m.set} className="pl-2.5 text-[12px] text-[#888]">{m.set} - {m.option}{m.price ? ` - ${rp(m.price)}` : ""}</p>
                  ))}
                </div>
              ))}
              {bill.billDiscounts.map((d) => (
                <Row key={d.name} l={<span>{d.name}{d.kind === "percent" ? ` (${pct(d.value)})` : ""}</span>} r={`(${rp(d.amount)})`} />
              ))}
            </div>

            <Rule />
            <Row l="Subtotal" r={rp(bill.subtotal)} />
            {s.gratuityEnabled && <Row l={`${settings?.gratuity_name || "Service"} (${pct(s.gratuityRateBp)})`} r={rp(bill.gratuity)} />}
            {s.taxEnabled && <Row l={`${settings?.tax_name || "Tax"} (${pct(s.taxRateBp)})`} r={rp(bill.tax)} />}
            {bill.rounding !== 0 && <Row l="Rounding" r={`${bill.rounding < 0 ? "-" : ""}${rp(bill.rounding)}`} />}
            {s.pricesIncludeTax && (s.taxEnabled || s.gratuityEnabled) && <p className="text-[11.5px] text-[#999]">Prices include tax & service</p>}
            <Rule />
            <div className="flex items-baseline justify-between text-[18px] font-bold text-[#222]"><span>Total</span><span className="tabular-nums">{rp(bill.total)}</span></div>
            <Row l="Cash" r={rp(cash)} />
            <Row l="Change" r={rp(cash - bill.total)} />

            {p.social && (
              <>
                <Rule />
                <p className="mb-2 text-[11px] font-semibold tracking-[0.04em] text-[#555]">LINKS</p>
                <p className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#3b5b98] text-white">
                    {/^https?:|\.(com|id|co|net|org)\b/i.test(p.social)
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                      : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>}
                  </span>
                  <span>{p.social}</span>
                </p>
              </>
            )}
            {p.footer && (
              <>
                <Rule />
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#555]">NOTE</p>
                <p className="whitespace-pre-line">{p.footer}</p>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-2">Sample bill using this location&apos;s checkout settings. The 58 mm printer prints the same details in a narrower layout.</p>
      </div>
    </div>
  );
}

const Rule = () => <div className="my-4 border-t border-[#e5e5e5]" />;
function Row({ l, r }: { l: ReactNode; r: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-[1px]"><span>{l}</span><span className="text-right tabular-nums">{r}</span></div>;
}
