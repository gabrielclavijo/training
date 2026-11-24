/**
 * Prepara la foto de perfil en el navegador: recorte cuadrado centrado,
 * 256×256 px, JPEG. Al volver a dibujarla se pierden los metadatos (EXIF, GPS).
 */
export const AVATAR_SIZE = 256
export const MAX_INPUT_BYTES = 15 * 1024 * 1024

export class AvatarError extends Error {}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new AvatarError('not_image')
  if (file.size > MAX_INPUT_BYTES) throw new AvatarError('too_big')
  let bitmap: ImageBitmap
  try {
    // imageOrientation respeta la rotación de las fotos tomadas con el celular
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new AvatarError('unreadable')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AvatarError('unreadable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new AvatarError('unreadable')
  return blob
}
