/**
 * Dibujos de los ejercicios: figura esquemática de perfil (lienzo 200 × 160,
 * piso en y = 150) con dos posiciones (inicio y final). La animación va de una
 * a otra. Cada dibujo resalta el músculo que trabaja y una flecha del movimiento.
 */

export type Pt = [number, number]
export interface Pose {
  head: Pt
  shoulder: Pt
  elbow: Pt
  wrist: Pt
  hip: Pt
  knee: Pt
  ankle: Pt
  toe: Pt
}
export interface Figure {
  start: Pose
  end: Pose
  /** Segmentos resaltados (músculo que trabaja) */
  highlight: ('thigh' | 'shin' | 'torso' | 'upperArm' | 'forearm' | 'glute' | 'back')[]
  /** Flecha del movimiento: desde, hasta */
  arrow?: [Pt, Pt]
  /** Elementos: banda anclada en un punto, mancuerna en la mano, banco, piso de colchoneta */
  band?: Pt
  dumbbell?: boolean
  bench?: { x: number; y: number; w: number }
  mat?: boolean
}

export const FIGURES: Record<string, Figure> = {
  squat: {
    start: { head: [101, 30], shoulder: [100, 45], elbow: [116, 54], wrist: [134, 56], hip: [98, 88], knee: [102, 119], ankle: [100, 150], toe: [116, 150] },
    end: { head: [116, 64], shoulder: [108, 78], elbow: [126, 82], wrist: [146, 82], hip: [78, 118], knee: [126, 122], ankle: [100, 150], toe: [116, 150] },
    highlight: ['thigh', 'glute'],
    arrow: [
      [52, 86],
      [52, 120],
    ],
  },
  glute_bridge: {
    start: { head: [32, 136], shoulder: [48, 142], elbow: [68, 146], wrist: [90, 146], hip: [100, 143], knee: [128, 112], ankle: [142, 148], toe: [156, 150] },
    end: { head: [32, 136], shoulder: [48, 142], elbow: [68, 146], wrist: [90, 146], hip: [98, 113], knee: [130, 106], ankle: [142, 148], toe: [156, 150] },
    highlight: ['glute', 'thigh'],
    arrow: [
      [98, 104],
      [98, 78],
    ],
    mat: true,
  },
  band_row: {
    start: { head: [116, 31], shoulder: [120, 46], elbow: [98, 62], wrist: [78, 72], hip: [128, 88], knee: [124, 119], ankle: [128, 150], toe: [114, 150] },
    end: { head: [116, 31], shoulder: [120, 46], elbow: [146, 64], wrist: [118, 70], hip: [128, 88], knee: [124, 119], ankle: [128, 150], toe: [114, 150] },
    highlight: ['back', 'upperArm'],
    arrow: [
      [70, 92],
      [108, 92],
    ],
    band: [24, 74],
  },
}
