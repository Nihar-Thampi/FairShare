import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Modal, Group, Button, Stack, Text, Loader, Center, ActionIcon, Tooltip,
  Divider,
} from '@mantine/core'
import { IconCheck, IconRotate, IconRotateClockwise } from '@tabler/icons-react'
import { warpPerspective, rotateImage } from '../../utils/perspectiveTransform'
import type { Pt } from '../../utils/perspectiveTransform'
import { computeAutoEnhance, DEFAULT_ENHANCE } from '../../utils/imageEnhance'
import type { EnhanceSettings } from '../../utils/imageEnhance'

interface Props {
  file: File
  pageLabel?: string
  onConfirm: (result: File) => void
  onCancel: () => void
}

const HANDLE_R = 10
const LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left']

export default function ImageEditor({ file, pageLabel, onConfirm, onCancel }: Props) {
  const [imgEl, setImgEl]             = useState<HTMLImageElement | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  const [handles, setHandles]         = useState<Pt[]>([])
  const [dragging, setDragging]       = useState<number | null>(null)
  const [processing, setProcessing]   = useState(false)
  const [enhance, setEnhance]         = useState<EnhanceSettings>(DEFAULT_ENHANCE)
  // Enhancement is computed automatically once the image loads — no user controls

  const [previewUrl, setPreviewUrl] = useState('')
  const allUrls = useRef<string[]>([])

  // Callback ref: fires when Modal portal mounts the container div
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Init preview URL; revoke all on unmount
  useEffect(() => {
    const url = URL.createObjectURL(file)
    allUrls.current = [url]
    setPreviewUrl(url)
    return () => { allUrls.current.forEach(u => URL.revokeObjectURL(u)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load <img> whenever previewUrl changes (also after rotate), then auto-compute enhancement
  useEffect(() => {
    if (!previewUrl) return
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      setEnhance(computeAutoEnhance(img))
    }
    img.src = previewUrl
  }, [previewUrl])

  // Compute display dimensions once BOTH image and container are available.
  // containerEl is state (not a ref) so this re-fires when the portal mounts.
  useEffect(() => {
    if (!imgEl || !containerEl) return
    const maxW = containerEl.clientWidth || 600
    const maxH = 460
    const scale = Math.min(maxW / imgEl.naturalWidth, maxH / imgEl.naturalHeight, 1)
    const w = Math.round(imgEl.naturalWidth * scale)
    const h = Math.round(imgEl.naturalHeight * scale)
    setDisplaySize({ w, h })
    setHandles([
      [HANDLE_R, HANDLE_R],
      [w - HANDLE_R, HANDLE_R],
      [w - HANDLE_R, h - HANDLE_R],
      [HANDLE_R, h - HANDLE_R],
    ])
  }, [imgEl, containerEl])

  // ── Drag helpers ─────────────────────────────────────────────────────────────

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const getSvgPt = useCallback((e: MouseEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }, [])

  const onHandleMouseDown = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault(); setDragging(idx)
  }

  useEffect(() => {
    if (dragging === null) return
    const onMove = (e: MouseEvent) => {
      if (!displaySize) return
      const [px, py] = getSvgPt(e)
      setHandles(prev => {
        const next = [...prev] as Pt[]
        next[dragging] = [clamp(px, 0, displaySize.w), clamp(py, 0, displaySize.h)]
        return next
      })
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, displaySize, getSvgPt])

  const onHandleTouchStart = (idx: number) => (e: React.TouchEvent) => {
    e.preventDefault(); setDragging(idx)
  }

  useEffect(() => {
    if (dragging === null || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]
      if (!displaySize) return
      setHandles(prev => {
        const next = [...prev] as Pt[]
        next[dragging] = [clamp(t.clientX - rect.left, 0, displaySize.w), clamp(t.clientY - rect.top, 0, displaySize.h)]
        return next
      })
    }
    const onEnd = () => setDragging(null)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd) }
  }, [dragging, displaySize])

  // ── Rotate ───────────────────────────────────────────────────────────────────

  const rotate = async (deg: 90 | 270) => {
    if (!imgEl) return
    setProcessing(true)
    try {
      const blob = await rotateImage(imgEl, deg)
      const newUrl = URL.createObjectURL(blob)
      allUrls.current = [...allUrls.current, newUrl]
      setPreviewUrl(newUrl)
    } finally {
      setProcessing(false)
    }
  }

  // ── Confirm — apply warp + enhancement then hand off immediately ─────────────

  const handleConfirm = async () => {
    if (!imgEl || !displaySize || handles.length !== 4) return
    setProcessing(true)
    try {
      const scaleX = imgEl.naturalWidth / displaySize.w
      const scaleY = imgEl.naturalHeight / displaySize.h
      const srcQuad: Pt[] = handles.map(([x, y]) => [x * scaleX, y * scaleY])
      const blob = await warpPerspective(imgEl, srcQuad, {
        brightness: enhance.brightness,
        contrast: enhance.contrast,
      })
      onConfirm(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
    } finally {
      setProcessing(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const polygonPoints = handles.map(([x, y]) => `${x},${y}`).join(' ')
  const ready = !!displaySize && handles.length === 4

  const cssFilter = [
    enhance.brightness !== 1 ? `brightness(${enhance.brightness})` : '',
    enhance.contrast   !== 1 ? `contrast(${enhance.contrast})`     : '',
  ].filter(Boolean).join(' ') || 'none'

  const title = pageLabel ? `Adjust image — ${pageLabel}` : 'Adjust image before scanning'

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Modal opened onClose={onCancel} title={title} size="xl" padding="md" centered>
      <Stack gap="sm">

        {/* Rotate toolbar */}
        <Group gap="xs">
          <Tooltip label="Rotate counter-clockwise">
            <ActionIcon variant="default" size="lg" onClick={() => rotate(270)} disabled={processing || !imgEl} aria-label="Rotate counter-clockwise"><IconRotate size={18} /></ActionIcon>
          </Tooltip>
          <Tooltip label="Rotate clockwise">
            <ActionIcon variant="default" size="lg" onClick={() => rotate(90)} disabled={processing || !imgEl} aria-label="Rotate clockwise"><IconRotateClockwise size={18} /></ActionIcon>
          </Tooltip>
          <Text size="xs" c="dimmed" ml={4}>
            Drag the 4 corner handles to frame the bill
          </Text>
        </Group>

        <Divider />

        {/* Image + SVG handles */}
        <div ref={setContainerEl} style={{ width: '100%', userSelect: 'none' }}>
          {!ready ? (
            <Center h={260}><Loader /></Center>
          ) : (
            <div style={{ position: 'relative', width: displaySize!.w, height: displaySize!.h, margin: '0 auto' }}>
              <img
                src={previewUrl}
                alt="Receipt preview"
                width={displaySize!.w}
                height={displaySize!.h}
                style={{ display: 'block', objectFit: 'fill', filter: cssFilter }}
                draggable={false}
              />
              <svg
                ref={svgRef}
                style={{
                  position: 'absolute', inset: 0,
                  cursor: dragging !== null ? 'crosshair' : 'default',
                  touchAction: 'none',
                }}
                width={displaySize!.w}
                height={displaySize!.h}
              >
                <defs>
                  <mask id="quad-mask">
                    <rect width={displaySize!.w} height={displaySize!.h} fill="white" />
                    <polygon points={polygonPoints} fill="black" />
                  </mask>
                </defs>
                <rect width={displaySize!.w} height={displaySize!.h} fill="rgba(0,0,0,0.4)" mask="url(#quad-mask)" />
                <polygon points={polygonPoints} fill="none" stroke="#12b886" strokeWidth={2} strokeDasharray="6 3" />
                {[0, 1, 2, 3].map(i => {
                  const [x1, y1] = handles[i], [x2, y2] = handles[(i + 1) % 4]
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#12b886" strokeWidth={1.5} />
                })}
                {handles.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r={HANDLE_R + 8} fill="transparent" style={{ cursor: 'grab' }}
                      onMouseDown={onHandleMouseDown(i)} onTouchStart={onHandleTouchStart(i)} />
                    <circle cx={x} cy={y} r={HANDLE_R}
                      fill={dragging === i ? '#087f5b' : '#12b886'} stroke="white" strokeWidth={2}
                      style={{ pointerEvents: 'none' }} />
                    <text x={x} y={y + HANDLE_R + 14} textAnchor="middle" fontSize={10} fill="white"
                      style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 1px black)' }}>
                      {LABELS[i]}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Actions */}
        <Group justify="flex-end" mt={4}>
          <Button variant="default" onClick={onCancel} disabled={processing}>
            Cancel
          </Button>
          <Button leftSection={<IconCheck size={16} />} onClick={handleConfirm} loading={processing} disabled={!ready}>
            Confirm
          </Button>
        </Group>

      </Stack>
    </Modal>
  )
}
