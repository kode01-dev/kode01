'use client';

import { clearZipchatBrowserStorage } from '@/features/cookies/lib/consent';

export type ZipchatApi = {
  identify?: (token: string) => void;
  open?: () => void;
  show?: () => void;
  toggle?: () => void;
  hide?: () => void;
  close?: () => void;
  destroy?: () => void;
};

type ZipchatWindow = Window & {
  Zipchat?: ZipchatApi;
};

export const ZIPCHAT_SCRIPT_ID = 'zipchat-widget';
export const ZIPCHAT_SCRIPT_SRC = 'https://app.zipchat.ai/widget/zipchat.js?id=wD35np9xnKUAM802YRtS';
export const OPEN_ZIPCHAT_SUPPORT_EVENT = 'kode01:zipchat-open-support';

export function getZipchatApi(): ZipchatApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as ZipchatWindow).Zipchat;
}

export function requestZipchatSupport(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_ZIPCHAT_SUPPORT_EVENT));
}

export function tryOpenZipchat(): boolean {
  const zipchat = getZipchatApi();
  if (zipchat?.open) {
    zipchat.open();
    return true;
  }

  if (zipchat?.show) {
    zipchat.show();
    return true;
  }

  if (zipchat?.toggle) {
    zipchat.toggle();
    return true;
  }

  return false;
}

export function cleanupZipchatRuntime(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const zipchat = getZipchatApi();
  try {
    zipchat?.close?.();
    zipchat?.hide?.();
    zipchat?.destroy?.();
  } catch {
    // Best-effort cleanup only; some vendor APIs throw when already unloaded.
  }

  document
    .querySelectorAll<HTMLScriptElement>(`script#${ZIPCHAT_SCRIPT_ID}, script[src*="zipchat"]`)
    .forEach((node) => node.remove());

  document
    .querySelectorAll<HTMLElement>('iframe[src*="zipchat"], [id*="zipchat"], [id*="Zipchat"]')
    .forEach((node) => {
      if (node.dataset.kode01ZipchatControl === 'true') return;
      node.remove();
    });

  delete (window as ZipchatWindow).Zipchat;
  clearZipchatBrowserStorage();
}
