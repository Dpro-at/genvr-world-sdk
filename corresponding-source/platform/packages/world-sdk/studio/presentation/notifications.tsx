import { useState, useEffect, useRef } from 'react';
import type { PresentationNotification } from '@genvr/assistant';
export type Notif = PresentationNotification & { id: string; repliedWith?: string };
// Left-border accent color per type
const NOTIF_BORDER: Record<Notif['type'], string> = {
  msg:       'border-blue-500',
  task:      'border-purple-500',
  approval:  'border-yellow-500',
  email:     'border-red-400',
  whatsapp:  'border-green-500',
  facebook:  'border-blue-600',
  instagram: 'border-pink-500',
  telegram:  'border-sky-400',
  discord:   'border-indigo-400',
  stripe:    'border-violet-500',
  paypal:    'border-blue-400',
  bank:      'border-emerald-500',
  applepay:  'border-gray-400',
  stock:     'border-green-400',
  calendar:  'border-sky-400',
  terminal:  'border-green-500',
  gif:       'border-pink-400',
  twitter:   'border-sky-400',
  tiktok:    'border-pink-400',
  linkedin:  'border-blue-500',
  snapchat:  'border-yellow-400',
  youtube:   'border-red-500',
  reddit:    'border-orange-500',
  twitch:    'border-purple-500',
  otp:       'border-emerald-400',
  faceid:    'border-blue-400',
  sms_otp:   'border-violet-400',
};

// Real brand SVG icons with official colors
function PlatformIcon({ type }: { type: Notif['type'] }) {
  const map: Record<Notif['type'], { bg: string; node: React.ReactNode }> = {
    msg: {
      bg: '#3B82F6',
      node: <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>,
    },
    task: {
      bg: '#8B5CF6',
      node: <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>,
    },
    approval: {
      bg: '#F59E0B',
      node: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>,
    },
    email: {
      bg: '#EA4335',
      node: <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>,
    },
    whatsapp: {
      bg: '#25D366',
      node: <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>,
    },
    facebook: {
      bg: '#1877F2',
      node: <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>,
    },
    instagram: {
      bg: 'gradient-ig',
      node: <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>,
    },
    telegram: {
      bg: '#2AABEE',
      node: <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>,
    },
    discord: {
      bg: '#5865F2',
      node: <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>,
    },
    stripe: {
      bg: '#635BFF',
      node: <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.91 5.623C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>,
    },
    paypal: {
      bg: '#0070BA',
      node: <path d="M20.067 8.478c.492.88.556 2.014.3 3.327-.74 3.806-3.276 5.12-6.514 5.12h-.5a.805.805 0 0 0-.794.68l-.04.22-.63 3.993-.032.17a.804.804 0 0 1-.794.679H8.972a.483.483 0 0 1-.477-.558L9.945 6.24a.805.805 0 0 1 .795-.68h5.288c.79 0 1.52.09 2.167.267.965.258 1.617.755 2.03 1.494zm-2.72 3.13c.271-1.401.011-2.344-.818-2.783a4.1 4.1 0 0 0-1.893-.383h-2.556l-1.101 6.976h2.062c2.11 0 3.679-1.001 4.306-3.81zM5.152 6.24a.805.805 0 0 1 .795-.68h2.76c-.036.232-.073.468-.11.706l-.797 5.058-.027.177a.805.805 0 0 1-.795.68H4.25l.902-5.941z"/>,
    },
    bank: {
      bg: '#10B981',
      node: <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>,
    },
    applepay: {
      bg: '#000000',
      node: <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>,
    },
    stock: {
      bg: '#16a34a',
      node: <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>,
    },
    calendar: {
      bg: '#0284c7',
      node: <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>,
    },
    terminal: {
      bg: '#15803d',
      node: <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zM8.71 14.29L5.41 11l3.3-3.29 1.42 1.41L8.24 11l1.89 1.88-1.42 1.41zm6.58 0l-1.42-1.41L15.76 11l-1.89-1.88 1.42-1.41L18.59 11l-3.3 3.29z"/>,
    },
    gif: {
      bg: '#db2777',
      node: <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm-8 12H8c-1.66 0-3-1.34-3-3V8c0-1.66 1.34-3 3-3h5c1.66 0 3 1.34 3 3v1h-2V8c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h5v-2h-3v-2h5v4c0 1.66-1.34 3-3 3zm8-2h-2v-2h-2v2h-2V9h2v2h2V9h2v4z"/>,
    },
    twitter: { bg: '#000000', node: <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/> },
    tiktok: { bg: '#010101', node: <><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 100 12.68 6.34 6.34 0 006.33-6.34V8.72a8.19 8.19 0 004.8 1.52V6.77a4.85 4.85 0 01-1.03-.08z" fill="#EE1D52"/><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 100 12.68 6.34 6.34 0 006.33-6.34V8.72a8.19 8.19 0 004.8 1.52V6.77a4.85 4.85 0 01-1.03-.08z" fill="white" opacity="0.4"/></> },
    linkedin: { bg: '#0A66C2', node: <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/> },
    snapchat: { bg: '#FFFC00', node: <path d="M12.166.8c4.563 0 7.674 3.165 7.674 7.928 0 1.012-.117 2.15-.234 3.21.293.078.606.117.918.117.371 0 .723-.058 1.036-.195.234.195.37.469.37.781 0 .547-.429.977-1.074 1.172-.605.195-1.27.273-1.934.273-.41 0-.82-.04-1.211-.117-1.074 2.852-3.848 4.785-7.577 4.785-3.73 0-6.504-1.933-7.578-4.785a7.643 7.643 0 01-1.21.117c-.664 0-1.329-.078-1.934-.273C.43 13.617 0 13.187 0 12.64c0-.312.137-.586.37-.781.313.137.665.195 1.036.195.312 0 .625-.039.918-.117a22.58 22.58 0 01-.234-3.21C2.09 3.965 5.2.8 9.764.8h2.402z" fill="#FFFC00"/> },
    youtube: { bg: '#FF0000', node: <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/> },
    reddit: { bg: '#FF4500', node: <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/> },
    twitch: { bg: '#9146FF', node: <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/> },
    otp: { bg: '#10B981', node: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93-2.67-1.14-5-4.43-5-7.93V7.18L12 5z"/> },
    faceid: { bg: '#1D4ED8', node: <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" stroke="white" strokeWidth="2" fill="none"/> },
    sms_otp: { bg: '#7C3AED', node: <path d="M21 10.5h.5a2 2 0 012 2v3a2 2 0 01-2 2H18a6 6 0 01-6-6V4a2 2 0 012-2h3a2 2 0 012 2v.5M3 10.5h.5m16.5 0H3.5m17 0V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-2.5M12 14v-4m0 0h4m-4 0H8" stroke="white" strokeWidth="2" fill="none"/> },
  };
  const { bg, node } = map[type];
  const bgStyle = bg === 'gradient-ig'
    ? { background: 'linear-gradient(135deg, #405DE6 0%, #833AB4 35%, #E1306C 65%, #F77737 100%)' }
    : { background: bg };
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={bgStyle}>
      <svg viewBox="0 0 24 24" fill="white" width="14" height="14">{node}</svg>
    </span>
  );
}

// ── Face ID / Biometric verification card ─────────────────────────────────────
function FaceIdNotifCard({ notif, onDismiss, onApprove }: { notif: Notif; onDismiss: () => void; onApprove: () => void }) {
  const [scanning, setScanning] = useState(true);
  const device = notif.biometricDevice || 'your device';
  const isApple = device.toLowerCase().includes('iphone') || device.toLowerCase().includes('ipad') || device.toLowerCase().includes('mac');
  const biometricName = isApple ? 'Face ID' : 'Fingerprint';
  const approve = () => { onApprove(); };
  return (
    <div className="bg-gray-900/97 backdrop-blur border border-gray-700 border-l-4 border-l-blue-400 rounded-r-xl p-3 shadow-2xl w-72" style={{ animation: 'notif-slide 0.3s ease forwards' }}>
      <div className="flex items-start gap-2 mb-3">
        <PlatformIcon type="faceid" />
        <div className="flex-1">
          <div className="text-xs font-bold text-white">{notif.title}</div>
          <div className="text-[10px] text-gray-400">{notif.from}</div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-white text-xs">✕</button>
      </div>
      <div className="flex flex-col items-center bg-gray-800 rounded-xl py-3 mb-3">
        <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center mb-2 transition-all ${scanning ? 'border-blue-400 shadow-[0_0_12px_2px_rgba(96,165,250,0.5)]' : 'border-green-400'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke={scanning ? '#60A5FA' : '#4ADE80'} strokeWidth="1.5" width="26" height="26">
            {isApple
              ? <><path d="M7 3H5a2 2 0 00-2 2v2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><path d="M17 21h2a2 2 0 002-2v-2"/><path d="M12 8v4l2 2"/><circle cx="12" cy="12" r="4"/></>
              : <><path d="M12 10a2 2 0 100 4 2 2 0 000-4z"/><path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17h8v-2.26C17.81 13.47 19 11.38 19 9c0-3.87-3.13-7-7-7z"/><path d="M9 21h6m-3-4v4"/></>
            }
          </svg>
        </div>
        <div className="text-[11px] text-gray-300 font-medium">{biometricName} on {device}</div>
        {scanning && <div className="text-[9px] text-blue-400 mt-0.5 animate-pulse">Waiting for biometric...</div>}
      </div>
      <div className="text-[10px] text-gray-400 text-center mb-2">{notif.body}</div>
      <div className="flex gap-2">
        <button onClick={approve} className="flex-1 text-[11px] py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">Confirm</button>
        <button onClick={onDismiss} className="flex-1 text-[11px] py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── SMS OTP card ───────────────────────────────────────────────────────────────
function SmsOtpNotifCard({ notif, onDismiss }: { notif: Notif; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = notif.otpCode || '------';
  const phone = notif.phoneNumber || '+•• ••• ••• ••••';
  const copy = () => { navigator.clipboard.writeText(code.replace(/\s/g,'')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div className="bg-gray-900/97 backdrop-blur border border-gray-700 border-l-4 border-l-violet-400 rounded-r-xl p-3 shadow-2xl w-72" style={{ animation: 'notif-slide 0.3s ease forwards' }}>
      <div className="flex items-start gap-2 mb-2">
        <PlatformIcon type="sms_otp" />
        <div className="flex-1">
          <div className="text-xs font-bold text-white">{notif.title}</div>
          <div className="text-[10px] text-gray-400">Sent to {phone}</div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-white text-xs">✕</button>
      </div>
      <div className="bg-gray-800 rounded-xl py-3 px-4 flex items-center justify-between mb-2">
        <span className="text-2xl font-mono font-bold tracking-[0.35em] text-violet-300">{code.slice(0,3)} {code.slice(3,6)}</span>
        <button onClick={copy} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-all ${copied ? 'bg-violet-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
      <div className="text-[9px] text-gray-600 text-center">Code expires in 5 min · Do not share</div>
    </div>
  );
}

// ── OTP notification card ─────────────────────────────────────────────────────
function OtpNotifCard({ notif, onDismiss }: { notif: Notif; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = notif.otpCode || '------';
  const copy = () => { navigator.clipboard.writeText(code.replace(/\s/g,'')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div className="bg-gray-900/97 backdrop-blur border border-gray-700 border-l-4 border-l-emerald-400 rounded-r-xl p-3 shadow-2xl w-72" style={{ animation: 'notif-slide 0.3s ease forwards' }}>
      <div className="flex items-start gap-2 mb-2">
        <PlatformIcon type="otp" />
        <div className="flex-1">
          <div className="text-xs font-bold text-white">{notif.title}</div>
          <div className="text-[10px] text-gray-400">{notif.body}</div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-white text-xs">✕</button>
      </div>
      <div className="bg-gray-800 rounded-xl py-3 px-4 flex items-center justify-between">
        <span className="text-2xl font-mono font-bold tracking-[0.35em] text-emerald-300">{code.slice(0,3)} {code.slice(3,6)}</span>
        <button onClick={copy} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-all ${copied ? 'bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
      <div className="text-[9px] text-gray-600 mt-1.5 text-center">Do not share this code with anyone</div>
    </div>
  );
}

// ── GIF notification card ──────────────────────────────────────────────────────
function GifNotifCard({ notif, onDismiss }: { notif: Notif; onDismiss: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const gifUrl = notif.gifUrl || '';

  return (
    <div
      className="bg-gray-900/97 backdrop-blur border border-gray-700 border-l-4 border-l-pink-400 rounded-r-xl shadow-2xl w-72 overflow-hidden"
      style={{ animation: 'notif-slide 0.3s ease forwards' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <PlatformIcon type="gif" />
          <div>
            <div className="text-xs font-bold text-white leading-tight">{notif.title}</div>
            {notif.from && <div className="text-[10px] text-gray-400">from {notif.from}</div>}
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-white text-xs flex-shrink-0 ml-1">✕</button>
      </div>
      {/* GIF image */}
      {gifUrl && !error ? (
        <div className="relative bg-gray-950">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <img
            src={gifUrl}
            alt={notif.title}
            className={`w-full max-h-48 object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        </div>
      ) : (
        <div className="px-3 py-2 text-[11px] text-gray-300">{notif.body}</div>
      )}
      {/* Caption if body differs from title */}
      {notif.body && notif.body !== notif.title && (
        <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-800">{notif.body}</div>
      )}
    </div>
  );
}

// ── Terminal notification card ─────────────────────────────────────────────────
function TerminalNotifCard({ notif, onDismiss, onApprove }: { notif: Notif; onDismiss: () => void; onApprove: () => void }) {
  return <div className="bg-gray-950 border border-gray-800 border-l-4 border-l-green-500 rounded-r-xl shadow-2xl w-72 overflow-hidden font-mono" style={{ animation: 'notif-slide 0.3s ease forwards' }}>
    <div className="flex justify-between px-3 py-2 bg-gray-900 text-gray-400 text-xs"><span>{notif.title}</span><button aria-label="Dismiss notification" onClick={onDismiss}>✕</button></div>
    <div className="p-3 space-y-2 text-xs"><pre className="whitespace-pre-wrap text-green-400">$ {notif.terminalCmd || notif.body}</pre>{notif.terminalOutput ? <pre className="whitespace-pre-wrap text-gray-300">{notif.terminalOutput}</pre> : null}
    {notif.needsApproval ? <button className="w-full rounded bg-green-700 text-white p-2" onClick={onApprove}>Approve</button> : null}</div>
  </div>;
}

function NotifCard({ notif, onDismiss, onApprove, onUpdate, onAiReply }: {
  notif: Notif;
  onDismiss: () => void;
  onApprove: () => void;
  onUpdate: (changes: Partial<Omit<Notif, 'id'>>) => Promise<void>;
  onAiReply: () => Promise<string>;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Specialized cards
  if (notif.type === 'terminal') return <TerminalNotifCard notif={notif} onDismiss={onDismiss} onApprove={onApprove} />;
  if (notif.type === 'gif')      return <GifNotifCard      notif={notif} onDismiss={onDismiss} />;
  if (notif.type === 'otp')      return <OtpNotifCard      notif={notif} onDismiss={onDismiss} />;
  if (notif.type === 'faceid')   return <FaceIdNotifCard   notif={notif} onDismiss={onDismiss} onApprove={onApprove} />;
  if (notif.type === 'sms_otp')  return <SmsOtpNotifCard   notif={notif} onDismiss={onDismiss} />;

  const border = NOTIF_BORDER[notif.type];
  const canReply = notif.canReply && !notif.repliedWith;

  const sendReply = async () => {
    if (!replyText.trim()) return;
    try { await onUpdate({ repliedWith: replyText.trim() }); } catch { return; }
    setShowReply(false);
    setReplyText('');
  };

  const handleAiReply = async () => {
    setAiLoading(true);
    try { const reply = await onAiReply(); if (reply) setReplyText(reply); } finally { setAiLoading(false); }
  };

  return (
    <div
      className={`bg-gray-900/96 backdrop-blur border border-gray-700 border-l-4 ${border} rounded-r-xl p-3 shadow-2xl w-72`}
      style={{ animation: 'notif-slide 0.3s ease forwards' }}
    >
      <div className="flex items-start gap-2">
        <PlatformIcon type={notif.type} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white leading-tight">{notif.title}</div>
          {notif.from && <div className="text-[10px] text-gray-400 mt-0.5">from {notif.from}</div>}
          <div className="text-[11px] text-gray-300 mt-1 leading-relaxed">{notif.body}</div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-white ml-1 text-xs flex-shrink-0 leading-none">✕</button>
      </div>

      {/* Approval buttons */}
      {notif.needsApproval && (
        <div className="flex gap-2 mt-2">
          <button onClick={onApprove} className="flex-1 text-[11px] py-1 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors">✓ Approve</button>
          <button onClick={onDismiss}  className="flex-1 text-[11px] py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors">✕ Deny</button>
        </div>
      )}

      {/* Replied badge */}
      {notif.repliedWith && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-[10px] text-green-400 font-semibold mb-0.5">Replied:</div>
          <div className="text-[10px] text-gray-300 leading-relaxed">{notif.repliedWith}</div>
        </div>
      )}

      {/* Reply section */}
      {canReply && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          {!showReply ? (
            <button
              onClick={() => setShowReply(true)}
              className="text-[11px] px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors w-full text-left"
            >
              ↩ Reply
            </button>
          ) : (
            <div className="space-y-1">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                rows={2}
                className="w-full text-[10px] bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleAiReply}
                  disabled={aiLoading}
                  className="flex-1 text-[10px] py-1 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 text-white transition-colors font-semibold"
                >
                  {aiLoading ? '⏳ Generating...' : '✦ AI Reply'}
                </button>
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim()}
                  className="flex-1 text-[10px] py-1 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white transition-colors font-semibold"
                >
                  Send ↗
                </button>
                <button
                  onClick={() => { setShowReply(false); setReplyText(''); }}
                  className="px-2 text-[10px] py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NotifStack({ notifs, onDismiss, onApprove, onUpdate, onAiReply }: {
  notifs: Notif[];
  onDismiss: (id: string) => void;
  onApprove: (id: string) => void;
  onUpdate: (id: string, changes: Partial<Omit<Notif, 'id'>>) => Promise<void>;
  onAiReply: (notif: Notif) => Promise<string>;
}) {
  if (notifs.length === 0) {
    return null;
  }
  return (
    <>
      <style>{`
        @keyframes notif-slide {
          from { transform: translateX(110%); opacity:0; }
          to   { transform: translateX(0);    opacity:1; }
        }
      `}</style>
      <div className="absolute right-2 top-16 bottom-2 z-50 space-y-2 pointer-events-none overflow-y-auto" style={{ maxWidth: 290 }}>
        {notifs.slice(-5).map(n => (
          <div key={n.id} className="pointer-events-auto">
            <NotifCard
              notif={n}
              onDismiss={() => onDismiss(n.id)}
              onApprove={() => onApprove(n.id)}
              onUpdate={(changes) => onUpdate(n.id, changes)}
              onAiReply={() => onAiReply(n)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
