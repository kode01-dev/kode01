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
const ZIPCHAT_SHADOW_HOST_ID = 'zipchat-shadow-host';
const ZIPCHAT_NATIVE_BUBBLE_SELECTOR = '[data-zipchat="bubble"], #widget-chat-button';

export function getZipchatApi(): ZipchatApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as ZipchatWindow).Zipchat;
}

function getNativeZipchatBubble(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const host = document.getElementById(ZIPCHAT_SHADOW_HOST_ID);
  const shadowBubble = host?.shadowRoot?.querySelector<HTMLElement>(ZIPCHAT_NATIVE_BUBBLE_SELECTOR);
  if (shadowBubble) return shadowBubble;

  return document.querySelector<HTMLElement>(ZIPCHAT_NATIVE_BUBBLE_SELECTOR);
}

export function isZipchatWidgetReady(): boolean {
  return Boolean(getZipchatApi() || getNativeZipchatBubble());
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

  const nativeBubble = getNativeZipchatBubble();
  if (nativeBubble) {
    nativeBubble.click();
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
