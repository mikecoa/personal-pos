import { requireOptionalNativeModule } from "expo";

export type FoundPrinter = { kind: "network" | "bluetooth" | "usb"; address: string; name: string; detail: string; isPrinter: boolean };

type Native = {
  scanNetwork(port: number, timeoutMs: number): Promise<FoundPrinter[]>;
  bluetoothDevices(): Promise<FoundPrinter[]>;
  usbDevices(): Promise<FoundPrinter[]>;
  requestUsbPermission(deviceName: string): Promise<boolean>;
  print(kind: string, address: string, base64: string): Promise<boolean>;
};

/** The native printer module; null inside Expo Go, which can't load it. */
export const PosPrinter = requireOptionalNativeModule<Native>("PosPrinter");
