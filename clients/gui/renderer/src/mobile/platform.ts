import { registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from "@capacitor/barcode-scanner";

export const keychain = registerPlugin<{
  load(): Promise<{ value: string | null }>;
  save(options: { value: string }): Promise<void>;
  clear(): Promise<void>;
  deviceName(): Promise<{ name: string }>;
}>("ArealKeychain");

export async function scanPairingLink() {
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    });
    return result.ScanResult || null;
  } catch (error) {
    if ((error as { code?: string }).code === "OS-PLUG-BARC-0006") return null;
    throw error;
  }
}

export async function observeLifecycle(onState: (active: boolean) => void) {
  const listener = await App.addListener("appStateChange", ({ isActive }) => onState(isActive));
  const state = await App.getState();
  onState(state.isActive);
  return () => listener.remove();
}
