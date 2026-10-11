import type { BrowserConfig } from 'web-respect-dpro/browser';

/** Only browser storage actually used by Genvr; disabled telemetry is not an optional service. */
export const webRespectConfig: BrowserConfig = {
  namespace: 'genvr:web-respect',
  storageVersion: 1,
  locale: 'en',
  features: ['accessibility', 'consent'],
  showLauncher: 'active',
  brand: { name: 'Genvr', url: '/', logo: '/brand/dpro-symbol-128.png' },
  policies: { privacy: '/privacy', cookies: '/privacy' },
  themeVariables: {
    primary: '--brand',
    accent: '--brand-dark',
    surface: '--surface',
    text: '--ink',
    border: '--neutral',
  },
  theme: { radius: '12px' },
  consent: {
    policyVersion: 'genvr-browser-2026-10-10-essential-only-v1',
    ttlMs: 180 * 24 * 60 * 60 * 1000,
    services: [],
  },
  inventory: [
    {
      name: 'Sign-in session',
      provider: 'Genvr',
      category: 'essential',
      storage: 'Authentication cookie',
      retention: 'Until the session expires or you sign out',
      privacyPolicy: '/privacy',
    },
    {
      name: 'Requested site and editor settings',
      provider: 'Genvr',
      category: 'essential',
      storage: 'Local browser storage: theme, audio, avatar and editor preferences',
      retention: 'Until you reset settings or clear browser storage',
      privacyPolicy: '/privacy',
    },
    {
      name: 'Accessibility and cookie preferences',
      provider: 'Genvr / Web Respect',
      category: 'essential',
      storage: 'Local browser storage, isolated under genvr:web-respect',
      retention: 'Cookie choices: up to 180 days; accessibility: until reset or cleared',
      privacyPolicy: '/privacy',
    },
  ],
  messages: {
    'consent.bannerDescription':
      'Genvr uses necessary storage for sign-in and the settings you request. Optional browser tracking is currently disabled. You can review or reset your choices here.',
    'consent.intro':
      'Only necessary browser services are currently used. Optional choices do not enable analytics, advertising, video or map services. If we introduce optional services, we will explain them and ask again.',
    'consent.functionalDescription': 'No optional personalization services are currently enabled.',
    'consent.analyticsDescription': 'Optional browser analytics and diagnostics are currently disabled.',
    'consent.marketingDescription': 'Genvr does not use browser advertising or marketing services.',
  },
};
