'use client';

import { useEffect, useRef } from 'react';
import type { Toolkit } from 'web-respect-dpro/browser';
import { useTheme } from '../lib/theme';
import { webRespectConfig } from '../lib/web-respect-config';

// Strict Mode and route/root remounts must finish disposing the previous effects before mounting again.
let lifecycle: Promise<void> = Promise.resolve();

/** The shared source-preserving UI, outside the content affected by accessibility options. */
export function WebRespectSupport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [, setTheme] = useTheme();
  const changeTheme = useRef(setTheme);
  changeTheme.current = setTheme;

  useEffect(() => {
    const target = mountRef.current;
    const content = document.getElementById('genvr-accessible-content');
    const footer = document.getElementById('genvr-support-controls');
    if (!target || !content || !footer) return;
    let active = true;
    let toolkit: Toolkit | undefined;
    let removeFooter: (() => void) | undefined;
    let observer: MutationObserver | undefined;
    let removeAccessibility: (() => void) | undefined;
    let hostEffects: HTMLStyleElement | undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const dark = () =>
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && media.matches);
    const syncEffects = () => {
      if (!hostEffects || !toolkit?.accessibility) return;
      const settings = toolkit.accessibility.get();
      // Read the host's current text-size setting without our temporary rem override.
      hostEffects.textContent = '';
      const baseFont = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const filter =
        [
          settings.monochrome ? 'grayscale(1)' : '',
          settings.highContrast ? 'contrast(1.5) brightness(1.1)' : '',
        ]
          .filter(Boolean)
          .join(' ') || 'none';
      const palette = settings.highContrast
        ? `--paper:${dark() ? '#000' : '#fff'};--surface:${dark() ? '#000' : '#fff'};--ink:${dark() ? '#fff' : '#000'};`
        : '';
      // Filtering an ancestor displaces fixed dialogs. Filter leaf media and use contrast tokens instead.
      // Root rem scaling reaches Tailwind text utilities; removing this sheet restores the host setting.
      hostEffects.textContent = `
        ${settings.fontSize !== 1 ? `html { font-size:${baseFont * settings.fontSize}px !important; }` : ''}
        #genvr-accessible-content { filter:none !important; font-size:inherit !important; ${palette} }
        #genvr-accessible-content :is(img,svg,canvas,video) { filter:${filter} !important; }
        ${settings.fontSize !== 1 ? '#genvr-accessible-content [role="dialog"][aria-modal="true"] { max-height:calc(100dvh - 2rem); overflow-y:auto; }' : ''}
      `;
    };
    const syncTheme = () => {
      toolkit?.setTheme(dark());
      syncEffects();
    };

    lifecycle = lifecycle
      .then(async () => {
        if (!active) return;
        const { mount, mountFooter } = await import('web-respect-dpro/browser');
        if (!active) return;
        toolkit = mount(target, {
          ...webRespectConfig,
          content,
          dark: dark(),
          onThemeChange: (value) => changeTheme.current(value ? 'dark' : 'light'),
          onError: () => console.warn('Web Respect could not persist a preference in this browser.'),
        });
        // Pinned 0.1.2 uses white foregrounds on primary surfaces. Match Genvr's inverse action token in both themes.
        const style = document.createElement('style');
        style.textContent = `
          :host { --wr-muted: color-mix(in srgb, var(--ink) 70%, var(--surface)) !important; --wr-tile: var(--paper) !important; }
          .header, .launcher, .action.primary { color: var(--on-brand); }
          .switch input:checked::after { background: var(--on-brand); }
        `;
        target.firstElementChild?.shadowRoot?.append(style);
        hostEffects = document.createElement('style');
        document.head.append(hostEffects);
        removeAccessibility = toolkit.accessibility?.subscribe(syncEffects);
        syncEffects();
        removeFooter = mountFooter(footer, toolkit, {
          locale: 'en',
          consentLabel: 'Cookie preferences',
          accessibilityLabel: 'Accessibility options',
          discoverLinks: false,
        });
        observer = new MutationObserver(syncTheme);
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme', 'style'],
        });
        media.addEventListener('change', syncTheme);
      })
      .catch(() => console.warn('Web Respect could not start; reload to try again.'));

    return () => {
      active = false;
      lifecycle = lifecycle
        .then(async () => {
          observer?.disconnect();
          media.removeEventListener('change', syncTheme);
          removeFooter?.();
          removeAccessibility?.();
          hostEffects?.remove();
          await toolkit?.dispose();
        })
        .catch(() => console.warn('Web Respect could not finish cleanup.'));
    };
  }, []);

  return (
    <>
      <style>
        {'#genvr-support-controls .web-respect-footer { display:flex; flex-wrap:wrap; gap:1rem; }'}
      </style>
      <div ref={mountRef} data-genvr-web-respect />
    </>
  );
}
