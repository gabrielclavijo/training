// Íconos de línea simples (decorativos: siempre acompañan un texto visible).
const paths = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  upload: 'M12 16V4m0 0l-5 5m5-5l5 5M4 20h16',
  goal: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  more: 'M4 6h16M4 12h16M4 18h16',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  import: 'M4 4h16v6H4zm0 10h16v6H4zm4-7h.01M8 17h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  plan: 'M8 3v4m8-4v4M4 7h16v13H4zM8 12h3m-3 4h6m3-4l1 1 2-2',
  food: 'M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10m10-18c-2 1-3 4-3 7h3v11',
  lab: 'M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9',
  trend: 'M3 17l6-6 4 4 8-8m0 0h-5m5 0v5',
  gauge: 'M12 21a9 9 0 1 1 9-9M12 12l4-4M7 16h.01M17 16h.01',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-8V9m-3-7h6',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  bike: 'M5.5 19a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm13 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 15.5L9 8h5l4.5 7.5M9 8L7.5 5H6m8 3l-2.5 7.5h-6',
  run: 'M14 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 21l3-6 3 2v5m-6-9l3-4 4 1 3 3 3 1M9 11l1 4',
  swim: 'M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 13l3-4 3 2 3-3M17 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  dumbbell: 'M6 7v10M3 9v6m15-8v10m3-8v6M6 12h12',
  mountain: 'M3 19l6-10 4 6 2-3 6 7z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  check: 'M5 12l5 5 9-10',
  moon: 'M20 15A8 8 0 1 1 9 4a6 6 0 0 0 11 11z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h11',
  sunrise: 'M12 3v3m-7.8 3.2 2.1 2.1m13.5-2.1-2.1 2.1M2 17h20M7 17a5 5 0 0 1 10 0M5 21h14',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4',
  apple: 'M12 7c-1-2-4-2.5-5.5-1C4 8.5 5 15 8 19c1.2 1.5 2.5 1.5 4 .8 1.5.7 2.8.7 4-.8 3-4 4-10.5 1.5-13-1.5-1.5-4.5-1-5.5 1zm0 0c0-2 1-4 3-4',
  cup: 'M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zm13 1h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2m4-2v2',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-4 6-6 10-8',
  alert: 'M12 3l10 18H2zm0 7v4m0 3h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2',
  drop: 'M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z',
  cart: 'M3 4h2l2.5 11h10L20 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.6 4.5L20 16m0 4v-4h-4',
  printer: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  flame: 'M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 2-5 5-5 8a7 7 0 0 0 7 7z',
  egg: 'M12 3c-3.5 0-6 6-6 10a6 6 0 0 0 12 0c0-4-2.5-10-6-10z',
  wheat: 'M12 22V8m0 4c-2 0-4-1.5-4-4 2 0 4 1.5 4 4zm0 0c2 0 4-1.5 4-4-2 0-4 1.5-4 4zm0 5c-2 0-4-1.5-4-4 2 0 4 1.5 4 4zm0 0c2 0 4-1.5 4-4-2 0-4 1.5-4 4zm0-9c-1.5-1-2-2.5-1-5 1.5 1 2 2.5 1 5z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  coins: 'M8 10a5 3 0 1 0 0-.01M3 10v4c0 1.7 2.2 3 5 3s5-1.3 5-3v-4m-2-3.5C12 5.6 13.4 5 15 5c2.8 0 5 1.3 5 3v4c0 1.5-1.6 2.7-4 3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  scale: 'M5 21h14a1 1 0 0 0 1-1V8a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v12a1 1 0 0 0 1 1zm7-12 2-3M8 9a4 4 0 0 1 8 0',
  menu: 'M4 7h16M4 12h16M4 17h10',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zm4 4h4',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  cloud: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  edit: 'M4 20h4L19 9l-4-4L4 16zm9-13l4 4',
  empty: 'M4 7h16l-2 13H6zM8 7V5a4 4 0 0 1 8 0v2',
} as const

export type IconName = keyof typeof paths

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  )
}

/** Mosaico de ícono para títulos de tarjetas. */
export function TitleIcon({ name, tone }: { name: IconName; tone?: 'coral' | 'sky' | 'soft' }) {
  return (
    <span className={`icon-tile${tone ? ` icon-tile-${tone}` : ''}`} aria-hidden="true">
      <Icon name={name} />
    </span>
  )
}
