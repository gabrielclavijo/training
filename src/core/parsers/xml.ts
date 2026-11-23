/**
 * Lectura liviana de XML para GPX y TCX. No usa DOMParser porque no existe dentro
 * de los Web Workers (donde corre la importación). Ignora los prefijos de nombres
 * (gpxtpx:hr y ns3:hr se leen igual).
 */

/** Devuelve el contenido de cada bloque <tag …>…</tag> (con atributos). */
export function blocks(xml: string, tag: string): { attrs: string; body: string }[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`, 'g')
  const out: { attrs: string; body: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push({ attrs: m[1] ?? '', body: m[2] ?? '' })
  return out
}

/** Texto del primer <tag>…</tag> dentro de un bloque. */
export function text(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml)
  return m ? decode(m[1].trim()) : undefined
}

export function num(xml: string, tag: string): number | undefined {
  const v = text(xml, tag)
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`).exec(attrs)
  return m ? decode(m[1] ?? m[2]) : undefined
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
