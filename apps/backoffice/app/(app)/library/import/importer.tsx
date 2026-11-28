"use client";
import { useT } from "@/components/lang";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatRupiah, parseCsv, rowsToItems, rp, type ImportResult } from "@pos/core";
import { Button, Card, ErrorNote } from "@/components/ui";
import { importItems, type ImportOutcome } from "./actions";

const TEMPLATE = "Name,Category,Variant,Price,SKU,Description\nKopi Susu,Minuman,Regular,18000,,\nKopi Susu,Minuman,Large,23000,,\nNasi Goreng Ayam,Menu Nasi,,28000,,Pakai telur\n";

export function Importer({ locationName }: { locationName: string }) {
  const t = useT();
  const [file, setFile] = useState<string>();
  const [result, setResult] = useState<ImportResult>();
  const [outcome, setOutcome] = useState<ImportOutcome>();
  const [pending, start] = useTransition();

  const onFile = async (f?: File) => {
    setOutcome(undefined);
    if (!f) return;
    if (f.size > 2_000_000) { setResult({ items: [], errors: [t("File is larger than 2 MB.")] }); return; }
    setFile(f.name);
    setResult(rowsToItems(parseCsv(await f.text())));
  };

  return (
    <div className="space-y-5">
      <Card title={t("1. Choose a CSV file")} description='Columns: Name and Price are required; Category, Variant, SKU and Description are optional. Rows with the same Name become variants of one item.'>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:brightness-110">
            {t("Choose file")}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span className="text-sm text-ink-2">{file ?? t("No file chosen")}</span>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="items-template.csv" className="ml-auto text-sm text-accent underline-offset-4 hover:underline">
            {t("Download template")}
          </a>
        </div>
        <p className="mt-3 text-xs text-ink-2">{t("From Excel: File → Save As → CSV. Item exports from other POS apps with “Item Name / Category / Variant Name / Price / SKU” columns are recognised.")}</p>
      </Card>

      {result && (
        <Card title={t("2. Check {n} items", { n: result.items.length })} description={t("They will be added to {place}. Items whose name already exists there are skipped.", { place: locationName })}>
          {result.errors.length > 0 && (
            <div className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              <p className="font-semibold">{result.errors.length} row(s) will be ignored:</p>
              <ul className="mt-1 list-disc pl-5">{result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
              {result.errors.length > 8 && <p className="mt-1">{t("…and {n} more", { n: result.errors.length - 8 })}</p>}
            </div>
          )}
          {result.items.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2"><tr><th className="px-3 py-2">{t("Name")}</th><th className="px-3 py-2">{t("Category")}</th><th className="px-3 py-2">{t("Prices")}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {result.items.slice(0, 300).map((i) => (
                    <tr key={i.name}>
                      <td className="px-3 py-2 font-medium">{i.name}</td>
                      <td className="px-3 py-2 text-ink-2">{i.category ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{i.variants.map((v) => `${v.name ? v.name + " " : ""}${formatRupiah(rp(v.price))}`).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button disabled={pending || result.items.length === 0 || !!outcome}
              onClick={() => start(async () => setOutcome(await importItems(JSON.stringify(result.items))))}>
              {pending ? t("Importing…") : t("Import {n} items", { n: result.items.length })}
            </Button>
          </div>
        </Card>
      )}

      {outcome && (
        <Card title={t("3. Done")}>
          <ErrorNote message={outcome.error} />
          <p className="font-medium text-accent">{t("Created {n} items.", { n: outcome.created })}</p>
          {outcome.skipped.length > 0 && <p className="mt-1 text-sm text-ink-2">{t("Skipped {n} already in this location:", { n: outcome.skipped.length })} {outcome.skipped.slice(0, 10).join(", ")}{outcome.skipped.length > 10 ? "…" : ""}</p>}
          {outcome.failed.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-danger">{outcome.failed.map((f) => <li key={f}>{f}</li>)}</ul>}
          <Link href="/library/items" className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline">{t("Go to items →")}</Link>
        </Card>
      )}
    </div>
  );
}
