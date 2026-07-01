export type Pt = [number, number]

/** Solve Ax = b via Gaussian elimination (in-place). Returns solution vector. */
function gaussSolve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Pivot: find row with max abs value in this column
    let maxRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-10) throw new Error('Singular matrix')
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / pivot
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return x
}

/**
 * Compute the 3×3 homography matrix (as a 9-element array, row-major, last element = 1)
 * that maps each src[i] → dst[i] for 4 point pairs.
 */
export function computeHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i]
    const [dx, dy] = dst[i]
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy])
    b.push(dx)
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy])
    b.push(dy)
  }

  const h = gaussSolve(A, b)
  return [...h, 1] // 9 elements; h[8] = 1 by convention
}

/** Map a single point through a 3×3 homography (9-element, row-major). */
export function applyH(H: number[], x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8]
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/**
 * Warp the source image so that srcQuad (TL, TR, BR, BL) maps to a rectangle.
 * Output dimensions are inferred from the quad's natural proportions.
 *
 * Uses bilinear interpolation (vs nearest-neighbour) so warped text edges stay
 * smooth — nearest-neighbour creates blocky pixel staircases that EasyOCR reads
 * as noise or extra characters.
 *
 * Optionally applies brightness + contrast on the same canvas before encoding so
 * that the output is only JPEG-compressed once (no second encode for enhancement).
 */
export async function warpPerspective(
  srcImage: HTMLImageElement,
  srcQuad: Pt[], // [TL, TR, BR, BL] in original image pixels
  enhance?: { brightness: number; contrast: number },
): Promise<Blob> {
  const [tl, tr, br, bl] = srcQuad

  const outW = Math.round((dist(tl, tr) + dist(bl, br)) / 2)
  const outH = Math.round((dist(tl, bl) + dist(tr, br)) / 2)

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = srcImage.naturalWidth
  srcCanvas.height = srcImage.naturalHeight
  srcCanvas.getContext('2d')!.drawImage(srcImage, 0, 0)
  const srcPx = srcCanvas.getContext('2d')!.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data

  const dstQuad: Pt[] = [[0, 0], [outW, 0], [outW, outH], [0, outH]]
  const Hinv = computeHomography(dstQuad, srcQuad)

  const outCanvas = document.createElement('canvas')
  outCanvas.width = outW
  outCanvas.height = outH
  const ctx = outCanvas.getContext('2d')!
  const outImg = ctx.createImageData(outW, outH)
  const out = outImg.data

  const sw = srcCanvas.width
  const sh = srcCanvas.height

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const [sx, sy] = applyH(Hinv, dx, dy)
      if (sx < 0 || sx >= sw || sy < 0 || sy >= sh) continue

      // Bilinear interpolation — smooth sub-pixel sampling, no staircase artifacts
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, sw - 1)
      const y1 = Math.min(y0 + 1, sh - 1)
      const fx = sx - x0, fy = sy - y0
      const ifx = 1 - fx, ify = 1 - fy
      const w00 = ifx * ify, w10 = fx * ify, w01 = ifx * fy, w11 = fx * fy

      const s00 = (y0 * sw + x0) * 4
      const s10 = (y0 * sw + x1) * 4
      const s01 = (y1 * sw + x0) * 4
      const s11 = (y1 * sw + x1) * 4
      const di  = (dy * outW + dx) * 4

      for (let c = 0; c < 4; c++) {
        out[di + c] = Math.round(
          srcPx[s00 + c] * w00 + srcPx[s10 + c] * w10 +
          srcPx[s01 + c] * w01 + srcPx[s11 + c] * w11,
        )
      }
    }
  }

  ctx.putImageData(outImg, 0, 0)

  // Apply brightness + contrast inline on the same canvas.
  // This avoids a second JPEG encode (double compression degrades character edges).
  // No sharpening here — unsharp kernels cause OCR to misread digits as letters.
  if (enhance && (enhance.brightness !== 1 || enhance.contrast !== 1)) {
    const id = ctx.getImageData(0, 0, outW, outH)
    const px = id.data
    const b = enhance.brightness, co = enhance.contrast
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = px[i + c] * b
        v = (v - 127.5) * co + 127.5
        px[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
    ctx.putImageData(id, 0, 0)
  }

  return new Promise((resolve, reject) =>
    outCanvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.95)
  )
}

/**
 * Rotate an image by 0 / 90 / 180 / 270 degrees and return a JPEG blob.
 */
export async function rotateImage(srcImage: HTMLImageElement, degrees: 0 | 90 | 180 | 270): Promise<Blob> {
  const rad = (degrees * Math.PI) / 180
  const sw = srcImage.naturalWidth
  const sh = srcImage.naturalHeight
  const outW = degrees === 90 || degrees === 270 ? sh : sw
  const outH = degrees === 90 || degrees === 270 ? sw : sh

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!
  ctx.translate(outW / 2, outH / 2)
  ctx.rotate(rad)
  ctx.drawImage(srcImage, -sw / 2, -sh / 2)

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92)
  )
}
