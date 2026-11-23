import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionIcon, Group, Loader, Modal, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconPencil, IconX } from '@tabler/icons-react'
import type { Bill } from '../../types'
import { getBillImageBlobUrl, deleteBillImage } from '../../api/bills'

interface Props {
  billId: number
  imagePath: string | null
  refreshKey?: number
  onImageDeleted?: (updatedBill: Bill) => void
  onEdit?: (filename: string, file: File) => void
}

export default function ReceiptViewer({ billId, imagePath, refreshKey, onImageDeleted, onEdit }: Props) {
  const [loadedEntries, setLoadedEntries] = useState<{ filename: string; url: string }[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [enlarged, setEnlarged] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const revokeRef = useRef<string[]>([])

  const filenames = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(imagePath ?? 'null')
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    } catch {
      return imagePath ? [imagePath] : []
    }
  }, [imagePath])
  const fetchKey = `${billId}|${imagePath}|${refreshKey}`
  const entries = filenames.length ? loadedEntries : []
  const loading = filenames.length > 0 && loadedKey !== fetchKey

  useEffect(() => {
    if (filenames.length === 0) return
    let cancelled = false
    Promise.all(
      filenames.map(async f => ({ filename: f, url: await getBillImageBlobUrl(billId, f) }))
    )
      .then(next => {
        if (cancelled) { next.forEach(e => URL.revokeObjectURL(e.url)); return }
        revokeRef.current.forEach(u => URL.revokeObjectURL(u))
        revokeRef.current = next.map(e => e.url)
        setLoadedEntries(next)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadedKey(fetchKey) })

    return () => { cancelled = true }
  }, [billId, filenames, fetchKey])

  // Revoke object URLs when the viewer unmounts
  useEffect(() => {
    const urls = revokeRef
    return () => { urls.current.forEach(u => URL.revokeObjectURL(u)) }
  }, [])

  const handleDelete = async (filename: string) => {
    setDeleting(filename)
    try {
      const updatedBill = await deleteBillImage(billId, filename)
      const removed = entries.find(e => e.filename === filename)
      if (removed) URL.revokeObjectURL(removed.url)
      setLoadedEntries(prev => prev.filter(e => e.filename !== filename))
      if (enlarged === entries.find(e => e.filename === filename)?.url) setEnlarged(null)
      onImageDeleted?.(updatedBill)
    } catch {
      // silently ignore — user can retry
    } finally {
      setDeleting(null)
    }
  }

  const handleEditClick = async (filename: string, url: string) => {
    const response = await fetch(url)
    const blob = await response.blob()
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
    onEdit?.(filename, file)
  }

  if (!imagePath) return null
  if (loading) return <Loader size="sm" />
  if (entries.length === 0) return null

  const editable = !!onEdit

  return (
    <>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>Scanned invoice</Text>
      <Group gap="sm" wrap="wrap">
        {entries.map(({ filename, url }) => (
          <div key={filename} className="fs-receipt-thumb">
            <UnstyledButton onClick={() => editable ? handleEditClick(filename, url) : setEnlarged(url)}>
              <img
                src={url}
                alt="Scanned invoice page"
                style={{
                  height: 160,
                  width: 'auto',
                  objectFit: 'contain',
                  cursor: editable ? 'pointer' : 'zoom-in',
                  display: 'block',
                }}
              />
            </UnstyledButton>

            {editable && (
              <Tooltip label="Re-adjust image" withArrow>
                <ActionIcon
                  size="md"
                  color="ink"
                  variant="filled"
                  radius="xl"
                  onClick={() => handleEditClick(filename, url)}
                  style={{ position: 'absolute', top: 6, left: 6, boxShadow: 'var(--mantine-shadow-sm)' }}
                  aria-label="Re-adjust image"
                >
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
            )}

            {onImageDeleted && (
              <Tooltip label="Delete image" withArrow>
                <ActionIcon
                  size="md"
                  color="red"
                  variant="filled"
                  radius="xl"
                  loading={deleting === filename}
                  onClick={() => handleDelete(filename)}
                  style={{ position: 'absolute', top: 6, right: 6, boxShadow: 'var(--mantine-shadow-sm)' }}
                  aria-label="Delete image"
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        ))}
      </Group>

      <Modal
        opened={!!enlarged}
        onClose={() => setEnlarged(null)}
        size="xl"
        padding="xs"
        centered
        title={entries.length > 1 ? `Page ${entries.findIndex(e => e.url === enlarged) + 1} of ${entries.length}` : 'Scanned invoice'}
      >
        {enlarged && (
          <img
            src={enlarged}
            alt="Scanned invoice page"
            style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }}
          />
        )}
      </Modal>
    </>
  )
}
