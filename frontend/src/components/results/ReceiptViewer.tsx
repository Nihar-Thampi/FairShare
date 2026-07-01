import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Group, Loader, Modal, Text, UnstyledButton } from '@mantine/core'
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
  const [entries, setEntries]   = useState<{ filename: string; url: string }[]>([])
  const [loading, setLoading]   = useState(false)
  const [enlarged, setEnlarged] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const revokeRef = useRef<string[]>([])

  useEffect(() => {
    let filenames: string[]
    try {
      const parsed = JSON.parse(imagePath ?? 'null')
      filenames = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    } catch {
      filenames = imagePath ? [imagePath] : []
    }

    if (filenames.length === 0) {
      setEntries([])
      return
    }

    setLoading(true)
    Promise.all(
      filenames.map(async f => ({ filename: f, url: await getBillImageBlobUrl(billId, f) }))
    )
      .then(next => {
        revokeRef.current.forEach(u => URL.revokeObjectURL(u))
        revokeRef.current = next.map(e => e.url)
        setEntries(next)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    return () => { revokeRef.current.forEach(u => URL.revokeObjectURL(u)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, imagePath, refreshKey])

  const handleDelete = async (filename: string) => {
    setDeleting(filename)
    try {
      const updatedBill = await deleteBillImage(billId, filename)
      const removed = entries.find(e => e.filename === filename)
      if (removed) URL.revokeObjectURL(removed.url)
      setEntries(prev => prev.filter(e => e.filename !== filename))
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
      <Text size="sm" fw={600} c="dimmed">Uploaded receipt</Text>
      <Group gap="sm" wrap="wrap">
        {entries.map(({ filename, url }) => (
          <div key={filename} style={{ position: 'relative', display: 'inline-block' }}>
            <UnstyledButton onClick={() => editable ? handleEditClick(filename, url) : setEnlarged(url)}>
              <img
                src={url}
                alt="Receipt"
                style={{
                  height: 160,
                  width: 'auto',
                  borderRadius: 8,
                  border: '1px solid var(--mantine-color-gray-3)',
                  objectFit: 'contain',
                  cursor: editable ? 'pointer' : 'zoom-in',
                  display: 'block',
                }}
              />
            </UnstyledButton>

            {editable && (
              <ActionIcon
                size="sm"
                color="blue"
                variant="filled"
                radius="xl"
                onClick={() => handleEditClick(filename, url)}
                style={{ position: 'absolute', top: 4, left: 4 }}
                aria-label="Re-adjust image"
              >
                ✎
              </ActionIcon>
            )}

            {onImageDeleted && (
              <ActionIcon
                size="sm"
                color="red"
                variant="filled"
                radius="xl"
                loading={deleting === filename}
                onClick={() => handleDelete(filename)}
                style={{ position: 'absolute', top: 4, right: 4 }}
                aria-label="Delete image"
              >
                ✕
              </ActionIcon>
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
        title={entries.length > 1 ? `Page ${entries.findIndex(e => e.url === enlarged) + 1} of ${entries.length}` : 'Receipt'}
      >
        {enlarged && (
          <img
            src={enlarged}
            alt="Receipt"
            style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }}
          />
        )}
      </Modal>
    </>
  )
}
