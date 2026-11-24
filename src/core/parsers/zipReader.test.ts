import { Encoder, Profile } from '@garmin/fitsdk'
import { strToU8, zipSync, gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit, simulate, stravaCsv } from '../../demo/files'
import { parseUploadBlob, type ParseOutcome } from '.'
import { listZip, readEntry } from './zipReader'

const start = new Date('2026-11-21T11:30:00Z')
const ride = () => encodeFit(simulate({ durationS: 1800, distanceM: 12_000, elevationGainM: 100, hrBase: 140 }), start, { sport: 'cycling', subSport: 'road' })

async function collect(blob: Blob, name: string) {
  const out: ParseOutcome[] = []
  let discovered = 0
  for await (const o of parseUploadBlob(blob, name, { onDiscovered: (n) => (discovered += n) })) out.push(o)
  return { out, discovered }
}

describe('lectura de .zip por partes (exportaciones grandes)', () => {
  it('exportación de Garmin: solo abre las actividades, con zips anidados sin comprimir y comprimidos', async () => {
    const part1 = zipSync({ 'a.fit': ride(), 'curso.fit': encodeCourseFit() }, { level: 0 })
    const part2 = zipSync({ 'b.fit': encodeFit(simulate({ durationS: 1200, distanceM: 3000, elevationGainM: 20, hrBase: 150 }), new Date('2026-11-22T11:00:00Z'), { sport: 'running' }) })
    const outer = zipSync(
      {
        'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': [part1, { level: 0 }],
        'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part2.zip': part2,
        // Datos que no son actividades: no se deben abrir ni contar como error
        'DI_CONNECT/DI-Connect-Wellness/sueño.json': strToU8('{"x":1}'),
        'DI_CONNECT/DI-Connect-Wellness/monitoreo.fit': new Uint8Array([1, 2, 3]),
      },
      { level: 0 },
    )
    const { out, discovered } = await collect(new Blob([outer as BlobPart]), 'garmin_export.zip')
    const ok = out.filter((o) => o.ok)
    expect(ok).toHaveLength(2)
    expect(ok.every((o) => o.ok && o.activity.originHint === 'garmin_export')).toBe(true)
    // El curso planeado se omite (no es error) y el monitoreo de bienestar ni se abre
    const skipped = out.filter((o) => !o.ok && o.skipped)
    expect(skipped).toHaveLength(1)
    expect(out.filter((o) => !o.ok && !o.skipped)).toHaveLength(0)
    expect(discovered).toBe(3)
  })

  it('exportación de Strava por partes: CSV, .fit.gz y actividades manuales', async () => {
    const csv = stravaCsv([
      { id: '7', date: start, name: 'Gravel', type: 'Gravel Ride', elapsedS: 1800, distanceM: 12000, filename: 'activities/7.fit.gz' },
      { id: '8', date: start, name: 'Pesas', type: 'Weight Training', elapsedS: 3600, distanceM: 0, filename: '' },
    ])
    const zip = zipSync({ 'activities.csv': strToU8(csv), 'activities/7.fit.gz': gzipSync(ride()) })
    const { out } = await collect(new Blob([zip as BlobPart]), 'export_1.zip')
    const ok = out.filter((o): o is Extract<ParseOutcome, { ok: true }> => o.ok)
    expect(ok.map((o) => o.activity.summary.subSport ?? o.activity.summary.sport).sort()).toEqual(['gravel', 'strength'])
  })

  it('lee zips en formato ZIP64 (los que se usan para archivos de más de 4 GB)', async () => {
    const content = strToU8('hola desde zip64')
    const blob = new Blob([buildZip64('carpeta/archivo.txt', content) as BlobPart])
    const entries = await listZip(blob)
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('carpeta/archivo.txt')
    expect(new TextDecoder().decode(await readEntry(blob, entries[0]))).toBe('hola desde zip64')
  })

  it('un archivo que no es zip ni actividad da un error claro', async () => {
    const { out } = await collect(new Blob([new Uint8Array([1, 2, 3])]), 'roto.zip')
    expect(out).toEqual([{ ok: false, name: 'roto.zip', code: 'corrupt' }])
  })
})

/** Un FIT de tipo «curso» (ruta planeada): no es una actividad. */
function encodeCourseFit() {
  const e = new Encoder()
  e.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: 'course', manufacturer: 'garmin', product: 1, timeCreated: start } as never)
  return e.close()
}

/** Construye a mano un zip mínimo con registros ZIP64 (sin comprimir). */
function buildZip64(name: string, data: Uint8Array) {
  const nameB = strToU8(name)
  const parts: Uint8Array[] = []
  const le = (n: number, bytes: number) => {
    const a = new Uint8Array(bytes)
    const dv = new DataView(a.buffer)
    if (bytes === 2) dv.setUint16(0, n, true)
    else if (bytes === 4) dv.setUint32(0, n, true)
    else dv.setBigUint64(0, BigInt(n), true)
    return a
  }
  const concat = (xs: Uint8Array[]) => {
    const out = new Uint8Array(xs.reduce((s, x) => s + x.length, 0))
    let o = 0
    for (const x of xs) out.set(x, (o += x.length) - x.length)
    return out
  }
  // Encabezado local
  const local = concat([le(0x04034b50, 4), le(45, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(data.length, 4), le(data.length, 4), le(nameB.length, 2), le(0, 2), nameB])
  parts.push(local, data)
  const cdOffset = local.length + data.length
  // Directorio central con tamaños y desplazamiento en 0xFFFFFFFF + campo extra ZIP64
  const extra = concat([le(0x0001, 2), le(24, 2), le(data.length, 8), le(data.length, 8), le(0, 8)])
  const central = concat([
    le(0x02014b50, 4), le(45, 2), le(45, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4),
    le(0xffffffff, 4), le(0xffffffff, 4), le(nameB.length, 2), le(extra.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4),
    le(0xffffffff, 4), nameB, extra,
  ])
  parts.push(central)
  const z64Offset = cdOffset + central.length
  const z64 = concat([le(0x06064b50, 4), le(44, 8), le(45, 2), le(45, 2), le(0, 4), le(0, 4), le(1, 8), le(1, 8), le(central.length, 8), le(cdOffset, 8)])
  const locator = concat([le(0x07064b50, 4), le(0, 4), le(z64Offset, 8), le(1, 4)])
  const eocd = concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(0xffff, 2), le(0xffff, 2), le(0xffffffff, 4), le(0xffffffff, 4), le(0, 2)])
  parts.push(z64, locator, eocd)
  return concat(parts)
}
