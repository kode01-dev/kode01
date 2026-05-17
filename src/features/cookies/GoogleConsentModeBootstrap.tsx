import Script from 'next/script';

const DEFAULT_GOOGLE_CONSENT_STATE = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  security_storage: 'granted',
} as const;

export default function GoogleConsentModeBootstrap() {
  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script id="google-consent-mode-default" strategy="beforeInteractive">
      {`window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);}
gtag('consent', 'default', ${JSON.stringify(DEFAULT_GOOGLE_CONSENT_STATE)});`}
    </Script>
  );
}
