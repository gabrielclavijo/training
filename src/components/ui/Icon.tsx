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
