/**
 * Errores de importación con un código estable. La interfaz traduce cada código a
 * un mensaje claro (i18n: import.errors.<código>), p. ej.
 * not_activity → «Este archivo no es una actividad válida».
 */
export type ImportErrorCode =
  | 'unsupported_type' // extensión que no sabemos leer
  | 'not_activity' // se pudo leer, pero no es una actividad (p. ej. un FIT de configuración)
  | 'corrupt' // archivo dañado o incompleto
  | 'empty' // sin puntos ni datos de tiempo
  | 'too_large'

export class ImportError extends Error {
  readonly code: ImportErrorCode
  constructor(code: ImportErrorCode, detail?: string) {
    super(detail ?? code)
    this.code = code
  }
}
