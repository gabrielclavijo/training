/// <reference lib="webworker" />
import { parseUpload, sha256Hex } from '../core/parsers'

/**
 * Lee los archivos fuera del hilo principal para que la pantalla no se congele,
 * incluso con un .zip de años de historial. Envía cada actividad leída apenas
 * está lista; la página la guarda y muestra el progreso.
 */

export type WorkerIn = { files: File[] }
export type WorkerOut =
  | { type: 'discovered'; add: number }
  | { type: 'item'; name: string; ok: true; parsed: import('../core/activity/types').ParsedActivity; sha256: string | null }
  | { type: 'item'; name: string; ok: false; code: string }
  | { type: 'done' }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  for (const file of e.data.files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    for (const out of parseUpload({ name: file.name, bytes }, { onDiscovered: (n) => post({ type: 'discovered', add: n }) })) {
      if (out.ok) {
        const sha256 = out.raw ? await sha256Hex(out.raw) : null
        post({ type: 'item', name: out.name, ok: true, parsed: out.activity, sha256 })
      } else {
        post({ type: 'item', name: out.name, ok: false, code: out.code })
      }
    }
  }
  post({ type: 'done' })
}

function post(m: WorkerOut) {
  self.postMessage(m)
}
