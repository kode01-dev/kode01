export const adCreativeGuidelines = {
  acceptedFormats: ['image/png', 'image/jpeg', 'image/webp'],
  maxFileSizeBytes: 1_500_000,
  recommendedSizes: [
    { name: 'Desktop Rectangle', width: 1200, height: 628 },
    { name: 'Square Responsive', width: 1080, height: 1080 },
    { name: 'Wide Banner', width: 1600, height: 400 },
  ],
  textLimits: {
    titleMaxChars: 90,
    ctaMaxChars: 40,
  },
  destinationRules: {
    internal: 'Use relative path starting with /',
    external: 'Use HTTPS URL only',
  },
  notes: [
    'Keep critical text inside a safe area with at least 8% margin on each side.',
    'Avoid misleading claims and excessive all-caps.',
    'Add UTM parameters for external campaigns when possible.',
  ],
  placementRestrictions: {
    news: {
      format: 'Compact horizontal banner',
      maxVisualHeightPx: 120,
      preferredSize: { width: 1600, height: 400 },
      enforced: {
        titleMaxChars: 48,
        ctaMaxChars: 20,
        requireImageUrlHttps: true,
        requireExternalDestinationHttps: true,
      },
      recommendation:
        'Favor clean visuals with short text so the ad does not dominate article content.',
    },
  },
} as const;
