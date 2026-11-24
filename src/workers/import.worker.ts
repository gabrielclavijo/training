/// <reference lib="webworker" />
import { parseUploadBlob, sha256Hex } from '../core/parsers'

/**
 * Lee los archivos fuera del hilo principal para que la pantalla no se congele,
 * incluso con un .zip de años de historial. Envía cada actividad leída apenas
 * está lista; la página la guarda y muestra el progreso.
 */

export type WorkerIn = { files: File[] }
export type WorkerOut =
  | { type: 'discovered'; add: number }
  | { type: 'item'; name: string; ok: true; parsed: import('../core/activity/types').ParsedActivity; sha256: string | null }
  | { type: 'item'; name: string; ok: false; code: string; skipped?: boolean }
  | { type: 'done' }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  for (const file of e.data.files) {
    // Se lee por partes: un .zip de varios GB nunca se carga entero en memoria
    for await (const out of parseUploadBlob(file, file.name, { onDiscovered: (n) => post({ type: 'discovered', add: n }) })) {
      if (out.ok) {
        const sha256 = out.raw ? await sha256Hex(out.raw) : null
        post({ type: 'item', name: out.name, ok: true, parsed: out.activity, sha256 })
      } else {
        post({ type: 'item', name: out.name, ok: false, code: out.code, skipped: out.skipped })
      }
    }
  }
  post({ type: 'done' })
}

function post(m: WorkerOut) {
  self.postMessage(m)
}
