import Link from "next/link";
import { getT } from "@/lib/prefs";
import { ButtonLink, Card } from "@/components/ui";

type Release = { version: string; versionCode: number; url: string; size?: number; notes?: string };

/** The newest Orda tablet app, from the same latest.json the tablets check for updates. */
async function latest(): Promise<Release | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/app-releases/latest.json`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as Release) : null;
  } catch { return null; }
}

export default async function TabletAppSettings() {
  const t = await getT();
  const r = await latest();
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={56} height={56} className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{r ? t("Orda {version} for Android", { version: r.version }) : t("Orda for Android")}</p>
            <p className="text-sm text-ink-2">{r?.notes ?? t("The POS app for tablets and phones.")}</p>
          </div>
          {r && <ButtonLink href={r.url}>{t("Download ({size} MB)", { size: Math.round((r.size ?? 0) / 1_000_000) })}</ButtonLink>}
        </div>
      </Card>
      <Card title={t("Installing and updating")}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-ink-2">
          <li>{t("Open this page on the tablet (or copy the file to it) and tap Download, then open the file.")}</li>
          <li>{t("Android asks once to allow installing from this source. Allow it, then tap Install.")}</li>
          <li>{t("Sign in once with the owner or an admin account and pick the location.")}</li>
          <li>{t("After that, the app offers new versions by itself (from 1.0.1 on), and it never interrupts an order.")}</li>
        </ol>
        <p className="mt-3 text-sm">
          <Link href="/settings/tablets" className="font-medium text-accent hover:underline">{t("See your tablets and whether they're syncing →")}</Link>
        </p>
      </Card>
    </>
  );
}
