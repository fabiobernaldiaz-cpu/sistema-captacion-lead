import * as THREE from "three";

export const TAU = Math.PI * 2;
export const CYAN = "#00D4FF";

/* PRNG determinista: Remotion renderiza los fotogramas en varias pestañas de
   Chrome a la vez, así que cualquier aleatoriedad tiene que dar siempre lo
   mismo o el polvo "saltaría" entre fotogramas. */
export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Sprite de luz radial, se pinta una vez y se reutiliza en todos los
   destellos. Con mezcla aditiva da el halo sin necesidad de post-proceso. */
let glow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.16, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.42, "rgba(255,255,255,0.22)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
