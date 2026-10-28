export interface EnhanceSettings {
  brightness: number  // CSS brightness() factor — 1.0 = no change, 0.5 = dimmer, 2.0 = brighter
  contrast: number    // CSS contrast()   factor — 1.0 = no change, 2.0 = double contrast
  sharpen: boolean
}

export const DEFAULT_ENHANCE: EnhanceSettings = { brightness: 1, contrast: 1, sharpen: false }

// Unsharp-mask kernel: amplifies edges without shifting overall brightness (weights sum to 1)
const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0]

function convolve3x3(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const dst = new Uint8ClampedArray(src)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const b = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++)
            sum += src[((y + ky) * w + (x + kx)) * 4 + c] * SHARPEN_KERNEL[(ky + 1) * 3 + (kx + 1)]
        dst[b + c] = Math.max(0, Math.min(255, sum))
      }
    }
  }
  return dst
}

/**
 * Apply enhancement to an existing canvas in-place.
 * Brightness/contrast replicates CSS filter() semantics so the live CSS preview
 * matches the actual output exactly:
 *   brightness(b): v = v * b
 *   contrast(c):   v = (v - 127.5) * c + 127.5
 */
function applyToCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, s: EnhanceSettings) {
  if (s.brightness === 1 && s.contrast === 1 && !s.sharpen) return

  const img = ctx.getImageData(0, 0, w, h)
  let px = img.data

  if (s.brightness !== 1 || s.contrast !== 1) {
    const b = s.brightness
    const c = s.contrast
    for (let i = 0; i < px.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        let v = px[i + ch] * b
        v = (v - 127.5) * c + 127.5
        px[i + ch] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }

  if (s.sharpen) px = convolve3x3(px, w, h)

  img.data.set(px)
  ctx.putImageData(img, 0, 0)
}

/**
 * Analyse pixel values and return brightness + contrast settings that stretch
 * the histogram so the darkest ink maps to black and the lightest background to white.
 *
 * Formula (derivation):
 *   We want the 1st-percentile gray → 0 and 99th-percentile gray → 255 after
 *   applying brightness(b) then contrast(c).
 *   Setting b = 255 / (lo + hi) centres the midpoint at 127.5.
 *   Setting c = 255 / (hi − lo) then stretches [lo, hi] to [0, 255].
 */
export function computeAutoEnhance(img: HTMLImageElement): EnhanceSettings {
  const SAMPLE = 300
  const sw = SAMPLE
  const sh = Math.round((img.naturalHeight / img.naturalWidth) * SAMPLE)

  const c = document.createElement('canvas')
  c.width = sw; c.height = sh
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, sw, sh)
  const { data } = ctx.getImageData(0, 0, sw, sh)

  const hist = new Uint32Array(256)
  const n = sw * sh
  for (let i = 0; i < data.length; i += 4) {
    hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++
  }

  const cut = n * 0.01
  let lo = 0, hi = 255, cum = 0
  for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum >= cut) { lo = v; break } }
  cum = 0
  for (let v = 255; v >= 0; v--) { cum += hist[v]; if (cum >= cut) { hi = v; break } }

  const range = hi - lo

  // If the image already spans most of the tonal range, leave it completely
  // untouched — enhancement on a clear receipt only softens the bilinear-warped
  // edges and can confuse the OCR.
  if (range >= 180) return DEFAULT_ENHANCE

  // Mild stretch only for genuinely low-contrast images (dim lighting, shadows,
  // coloured paper). Target 200 instead of 255 to avoid overcorrection, and keep
  // brightness close to 1.0.  Sharpen stays off — unsharp kernels cause digit/
  // letter confusions in EasyOCR.
  const contrast   = Math.min(1.8, parseFloat((200 / Math.max(range, 1)).toFixed(2)))
  const brightness = Math.min(1.2, Math.max(0.85, parseFloat((200 / (lo + hi || 1)).toFixed(2))))

  return { brightness, contrast, sharpen: false }
}

/**
 * Apply enhancement settings to a Blob and return a new JPEG Blob.
 * This is called once on upload after the perspective warp.
 */
export async function applyEnhancementToBlob(source: Blob, s: EnhanceSettings): Promise<Blob> {
  if (s.brightness === 1 && s.contrast === 1 && !s.sharpen) return source

  const url = URL.createObjectURL(source)
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image()
    el.onload = () => res(el)
    el.onerror = rej
    el.src = url
  })
  URL.revokeObjectURL(url)

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  applyToCanvas(ctx, canvas.width, canvas.height, s)

  return new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.92)
  )
}
