import { inflateSync } from 'fflate'

/**
 * Lector de .zip por partes, sobre un Blob/File, SIN cargar el archivo entero en
 * memoria. Necesario para las exportaciones completas de Garmin o Strava, que
 * pueden pesar varios GB: primero se lee el índice (al final del zip) y luego
 * solo los archivos que interesan, uno a la vez. Soporta ZIP64 (archivos > 4 GB).
 */

export interface ZipEntry {
  name: string
  method: number // 0 = sin comprimir, 8 = deflate
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const SIG_EOCD = 0x06054b50
const SIG_ZIP64_LOCATOR = 0x07064b50
const SIG_ZIP64_EOCD = 0x06064b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50
const MAX32 = 0xffffffff

async function readRange(blob: Blob, start: number, end: number) {
  return new DataView(await blob.slice(start, end).arrayBuffer())
}

const u64 = (dv: DataView, off: number) => Number(dv.getBigUint64(off, true))

export async function isZip(blob: Blob) {
  if (blob.size < 4) return false
  const dv = await readRange(blob, 0, 4)
  return dv.getUint32(0, true) === SIG_LOCAL
}

/** Lista las entradas del zip leyendo solo el directorio central. */
export async function listZip(blob: Blob): Promise<ZipEntry[]> {
  // El registro final (EOCD) está en los últimos 22 bytes + comentario (≤ 64 KB)
  const tailStart = Math.max(0, blob.size - (65_535 + 22))
  const tail = await readRange(blob, tailStart, blob.size)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip sin índice')

  let count = tail.getUint16(eocd + 10, true)
  let cdSize = tail.getUint32(eocd + 12, true)
  let cdOffset = tail.getUint32(eocd + 16, true)

  // ZIP64: los valores reales están en otro registro
  if (count === 0xffff || cdSize === MAX32 || cdOffset === MAX32) {
    const locPos = eocd - 20
    if (locPos >= 0 && tail.getUint32(locPos, true) === SIG_ZIP64_LOCATOR) {
      const z64Offset = u64(tail, locPos + 8)
      const z64 = await readRange(blob, z64Offset, z64Offset + 56)
      if (z64.getUint32(0, true) !== SIG_ZIP64_EOCD) throw new Error('zip64 dañado')
      count = u64(z64, 32)
      cdSize = u64(z64, 40)
      cdOffset = u64(z64, 48)
    }
  }

  const cd = await readRange(blob, cdOffset, cdOffset + cdSize)
  const entries: ZipEntry[] = []
  const utf8 = new TextDecoder()
  let p = 0
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== SIG_CENTRAL) break
    const method = cd.getUint16(p + 10, true)
    let compressedSize = cd.getUint32(p + 20, true)
    let uncompressedSize = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    let localHeaderOffset = cd.getUint32(p + 42, true)
    const name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen))

    // Campo extra ZIP64 (id 0x0001): trae los valores que no cupieron en 32 bits
    let e = p + 46 + nameLen
    const extraEnd = e + extraLen
    while (e + 4 <= extraEnd) {
      const id = cd.getUint16(e, true)
      const size = cd.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        if (uncompressedSize === MAX32) (uncompressedSize = u64(cd, q)), (q += 8)
        if (compressedSize === MAX32) (compressedSize = u64(cd, q)), (q += 8)
        if (localHeaderOffset === MAX32) localHeaderOffset = u64(cd, q)
      }
      e += 4 + size
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    p = extraEnd + commentLen
  }
  return entries
}

async function dataRange(blob: Blob, e: ZipEntry) {
  const h = await readRange(blob, e.localHeaderOffset, e.localHeaderOffset + 30)
  if (h.getUint32(0, true) !== SIG_LOCAL) throw new Error('entrada dañada')
  const start = e.localHeaderOffset + 30 + h.getUint16(26, true) + h.getUint16(28, true)
  return { start, end: start + e.compressedSize }
}

/** Contenido de una entrada (se descomprime solo esa). */
export async function readEntry(blob: Blob, e: ZipEntry): Promise<Uint8Array> {
  const { start, end } = await dataRange(blob, e)
  const raw = new Uint8Array(await blob.slice(start, end).arrayBuffer())
  if (e.method === 0) return raw
  if (e.method === 8) return inflateSync(raw, { out: new Uint8Array(e.uncompressedSize) })
  throw new Error(`compresión no soportada (${e.method})`)
}

/**
 * Una entrada como Blob. Si está guardada sin comprimir (lo usual para los zips
 * dentro de la exportación de Garmin) es solo una «ventana» al archivo: no ocupa memoria.
 */
export async function entryBlob(blob: Blob, e: ZipEntry): Promise<Blob> {
  if (e.method === 0) {
    const { start, end } = await dataRange(blob, e)
    return blob.slice(start, end)
  }
  return new Blob([(await readEntry(blob, e)) as BlobPart])
}
