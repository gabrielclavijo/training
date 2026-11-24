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
