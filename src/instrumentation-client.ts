const HYDRATION_EXTENSION_ATTRS = ['data-jetski-tab-id', 'fdprocessedid'] as const;

const DEFAULT_GOOGLE_CONSENT_STATE = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  security_storage: 'granted',
} as const;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function bootstrapGoogleConsentMode(): void {
  if (typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('consent', 'default', DEFAULT_GOOGLE_CONSENT_STATE);
}

function removeHydrationExtensionAttributes(): void {
  if (typeof document === 'undefined') return;

  const html = document.documentElement;
  if (!html) return;

  const selector = HYDRATION_EXTENSION_ATTRS.map((attr) => `[${attr}]`).join(',');
  const cleanElement = (element: Element) => {
    for (const attr of HYDRATION_EXTENSION_ATTRS) {
      if (element.hasAttribute(attr)) {
        element.removeAttribute(attr);
      }
    }
  };
  const clean = () => {
    cleanElement(html);
    if (document.body) {
      cleanElement(document.body);
    }
    for (const node of document.querySelectorAll(selector)) {
      cleanElement(node);
    }
  };

  clean();

  if (typeof MutationObserver === 'undefined') return;

  const observer = new MutationObserver(clean);
  observer.observe(html, {
    attributes: true,
    attributeFilter: [...HYDRATION_EXTENSION_ATTRS],
    childList: true,
    subtree: true,
  });

  const disconnect = () => {
    window.setTimeout(() => observer.disconnect(), 3000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disconnect, { once: true });
  } else {
    disconnect();
  }
}

bootstrapGoogleConsentMode();
removeHydrationExtensionAttributes();

export {};
