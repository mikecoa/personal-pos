import { Linking, PermissionsAndroid, Platform } from "react-native";
import { PosPrinter, type FoundPrinter } from "../../modules/pos-printer";
import { t } from "./i18n";
import type { PrinterSettings } from "./store";

export type { FoundPrinter };

/** False inside Expo Go: printing needs the POS app build. */
export const printingAvailable = () => PosPrinter !== null;

/** Characters per line for the paper width. */
export const lineWidth = (paper: 58 | 80) => (paper === 80 ? 48 : 32);

async function bluetoothAllowed() {
  if (Platform.OS !== "android" || (Platform.Version as number) < 31) return true;
  const r = await PermissionsAndroid.request("android.permission.BLUETOOTH_CONNECT" as never);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Looks for printers on every connection at once: same Wi-Fi network (port 9100), Bluetooth
 * devices paired in Android settings, and USB. Problems (Bluetooth off, permission refused) are
 * returned as short messages next to whatever was found.
 */
export async function findPrinters(): Promise<{ found: FoundPrinter[]; notes: string[] }> {
  if (!PosPrinter) return { found: [], notes: [t("Printing needs the POS app (not Expo Go).")] };
  const notes: string[] = [];
  const [net, bt, usb] = await Promise.all([
    PosPrinter.scanNetwork(9100, 400).catch(() => { notes.push(t("Couldn't search the Wi-Fi network.")); return []; }),
    bluetoothAllowed().then((ok) => {
      if (!ok) { notes.push(t("Bluetooth printers need the “Nearby devices” permission.")); return []; }
      return PosPrinter!.bluetoothDevices().catch((e: Error) => {
        notes.push(String(e.message).includes("BLUETOOTH_OFF") ? t("Bluetooth is off on this tablet.") : t("Couldn't read Bluetooth devices."));
        return [];
      });
    }),
    PosPrinter.usbDevices().catch(() => []),
  ]);
  return { found: [...net, ...bt, ...usb], notes };
}

/** USB printers need Android's one-time permission before printing. */
export async function allowUsb(p: FoundPrinter) {
  if (p.kind !== "usb" || !PosPrinter) return true;
  return PosPrinter.requestUsbPermission(p.address);
}

export const openBluetoothSettings = () =>
  Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS").catch(() => Linking.openSettings());

// ───────────────────────────── ESC/POS
const ESC = 0x1b, GS = 0x1d;
/** Receipt text → bytes: plain ASCII (common symbols mapped), then feed and cut. */
export function escpos(lines: string[], copies = 1): Uint8Array {
  const clean = (s: string) => s.replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/×/g, "x").replace(/…/g, "...")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
  const out: number[] = [];
  for (let c = 0; c < Math.max(1, copies); c++) {
    out.push(ESC, 0x40);                                        // reset
    for (const l of lines) { for (const ch of clean(l)) out.push(ch.charCodeAt(0)); out.push(0x0a); }
    out.push(ESC, 0x64, 4);                                     // feed 4 lines
    out.push(GS, 0x56, 0x42, 0x00);                             // cut (ignored by printers without a cutter)
  }
  return Uint8Array.from(out);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : "=") + (i + 2 < bytes.length ? B64[n & 63]! : "=");
  }
  return s;
}

/** Sends receipt lines to the tablet's printer. Throws a readable message when it can't. */
export async function printLines(p: PrinterSettings, lines: string[], copies = p.copies) {
  if (!PosPrinter) throw new Error(t("Printing needs the POS app (not Expo Go)."));
  if (p.connection === "none" || !p.address) throw new Error(t("No printer is set up on this tablet."));
  try {
    await PosPrinter.print(p.connection, p.address, base64(escpos(lines, copies)));
  } catch (e) {
    const m = String((e as Error).message ?? e);
    if (m.includes("BLUETOOTH_PERMISSION")) throw new Error(t("Bluetooth printers need the “Nearby devices” permission."));
    if (m.includes("USB_PERMISSION")) throw new Error(t("Allow USB access to the printer first (Settings → Printer)."));
    if (m.includes("BLUETOOTH_OFF")) throw new Error(t("Bluetooth is off on this tablet. Turn it on and try again."));
    if (m.includes("BLUETOOTH_CONNECT")) throw new Error(t("Couldn't connect to the Bluetooth printer. Make sure it's on, and that no other app or tablet is connected to it, then try again."));
    // Keep the technical reason visible so an unexpected failure can be diagnosed from a photo.
    const why = m.replace(/^.*(Caused by|→)\s*:?\s*/s, "").slice(0, 120);
    throw new Error(`${t("Couldn't reach the printer. Check it's on and connected.")}${why ? ` (${why})` : ""}`);
  }
}
