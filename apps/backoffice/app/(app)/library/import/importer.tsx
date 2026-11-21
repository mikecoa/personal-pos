"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatRupiah, parseCsv, rowsToItems, rp, type ImportResult } from "@pos/core";
import { Button, Card, ErrorNote } from "@/components/ui";
import { importItems, type ImportOutcome } from "./actions";

const TEMPLATE = "Name,Category,Variant,Price,SKU,Description\nKopi Susu,Minuman,Regular,18000,,\nKopi Susu,Minuman,Large,23000,,\nNasi Goreng Ayam,Menu Nasi,,28000,,Pakai telur\n";

export function Importer({ locationName }: { locationName: string }) {
  const [file, setFile] = useState<string>();
  const [result, setResult] = useState<ImportResult>();
  const [outcome, setOutcome] = useState<ImportOutcome>();
  const [pending, start] = useTransition();

  const onFile = async (f?: File) => {
    setOutcome(undefined);
    if (!f) return;
    if (f.size > 2_000_000) { setResult({ items: [], errors: ["File is larger than 2 MB."] }); return; }
    setFile(f.name);
    setResult(rowsToItems(parseCsv(await f.text())));
  };

  return (
    <div className="space-y-5">
      <Card title="1. Choose a CSV file" description='Columns: Name and Price are required; Category, Variant, SKU and Description are optional. Rows with the same Name become variants of one item.'>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:brightness-110">
            Choose file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span className="text-sm text-ink-2">{file ?? "No file chosen"}</span>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="items-template.csv" className="ml-auto text-sm text-accent underline-offset-4 hover:underline">
            Download template
          </a>
        </div>
        <p className="mt-3 text-xs text-ink-2">From Excel: File → Save As → CSV. Moka exports with “Item Name / Category / Variant Name / Price / SKU” columns are recognised.</p>
      </Card>

      {result && (
        <Card title={`2. Check ${result.items.length} item${result.items.length === 1 ? "" : "s"}`} description={`They will be added to ${locationName}. Items whose name already exists there are skipped.`}>
          {result.errors.length > 0 && (
            <div className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              <p className="font-semibold">{result.errors.length} row(s) will be ignored:</p>
              <ul className="mt-1 list-disc pl-5">{result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
              {result.errors.length > 8 && <p className="mt-1">…and {result.errors.length - 8} more</p>}
            </div>
          )}
          {result.items.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Prices</th></tr></thead>
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
              {pending ? "Importing…" : `Import ${result.items.length} item${result.items.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </Card>
      )}

      {outcome && (
        <Card title="3. Done">
          <ErrorNote message={outcome.error} />
          <p className="font-medium text-accent">Created {outcome.created} item(s).</p>
          {outcome.skipped.length > 0 && <p className="mt-1 text-sm text-ink-2">Skipped {outcome.skipped.length} already in this location: {outcome.skipped.slice(0, 10).join(", ")}{outcome.skipped.length > 10 ? "…" : ""}</p>}
          {outcome.failed.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-danger">{outcome.failed.map((f) => <li key={f}>{f}</li>)}</ul>}
          <Link href="/library/items" className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline">Go to items →</Link>
        </Card>
      )}
    </div>
  );
}
