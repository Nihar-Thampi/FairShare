import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Stack, Text, Alert, Loader, Center, Group, Button, Badge, ThemeIcon } from '@mantine/core'
import { IconAlertTriangle, IconBolt, IconCircleCheck, IconCloudUpload, IconRefresh } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { uploadReceipt } from '../../api/ocr'
import ImageEditor from './ImageEditor'
import type { BillItem } from '../../types'

interface Props {
  billId: number
  ocrOk: boolean
  onComplete: (items: BillItem[], businessName: string | null) => void
  onClear: () => Promise<void>
  extractedCount: number
}

export default function ReceiptUploader({ billId, ocrOk, onComplete, onClear, extractedCount }: Props) {
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [processingMs, setProcessingMs] = useState<number | null>(null)
  // Queue: files waiting to be edited one-by-one
  const [editQueue, setEditQueue] = useState<File[]>([])
  // Edited files accumulated across sessions before final upload
  const [editedFiles, setEditedFiles] = useState<File[]>([])

  /** Upload a finalized list of files (already perspective-corrected). */
  const runUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setStatus(files.length > 1 ? `Processing ${files.length} pages...` : `Processing ${files[0].name}...`)
    try {
      const result = await uploadReceipt(billId, files)
      if (result.processing_time_ms != null) setProcessingMs(result.processing_time_ms)
      notifications.show({
        title: 'Receipt processed',
        message: files.length > 1
          ? `Processed ${files.length} pages — ${result.items.length} item(s) total`
          : `Extracted ${result.items.length} item(s)`,
        color: 'green',
      })
      onComplete(result.items, result.business_name)
    } catch (e: unknown) {
      notifications.show({ title: 'Upload failed', message: e instanceof Error ? e.message : 'Upload failed', color: 'red' })
    }
    setStatus(null)
    setUploading(false)
  }, [billId, onComplete])

  /** Called when user drops / selects files — open editor for first file. */
  const onDrop = useCallback((files: File[]) => {
    if (files.length === 0) return
    setEditQueue(files)   // first file opens editor; rest wait in queue
    setEditedFiles([])
  }, [])

  /** Editor confirmed one file — advance the queue. */
  const handleEditorConfirm = useCallback((result: File) => {
    const accumulated = [...editedFiles, result]
    const [, ...remaining] = editQueue
    if (remaining.length > 0) {
      // More files to edit
      setEditedFiles(accumulated)
      setEditQueue(remaining)
    } else {
      // All files edited — upload them all
      setEditQueue([])
      setEditedFiles([])
      runUpload(accumulated)
    }
  }, [editQueue, editedFiles, runUpload])

  /** User cancelled the editor — discard everything. */
  const handleEditorCancel = useCallback(() => {
    setEditQueue([])
    setEditedFiles([])
  }, [])

  const handleClear = async () => {
    setClearing(true)
    try {
      await onClear()
      setProcessingMs(null)
    } finally {
      setClearing(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'] },
    disabled: uploading || editQueue.length > 0,
  })

  const formatTime = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`

  const currentFile = editQueue[0] ?? null
  const pageLabel = editQueue.length > 1
    ? `Page ${editedFiles.length + 1} of ${editedFiles.length + editQueue.length}`
    : null

  return (
    <Stack>
      {/* Image editor opens for each file before upload */}
      {currentFile && (
        <ImageEditor
          key={editedFiles.length}
          file={currentFile}
          pageLabel={pageLabel ?? undefined}
          onConfirm={handleEditorConfirm}
          onCancel={handleEditorCancel}
        />
      )}
      {!ocrOk && (
        <Alert color="orange" variant="light" title="OCR unavailable" icon={<IconAlertTriangle size={18} />}>
          The OpenAI API is not reachable. Check that <code>OPENAI_API_KEY</code> is set
          correctly in the backend <code>.env</code> file. Scanning will fail without it.
        </Alert>
      )}

      <div
        {...getRootProps()}
        className="fs-dropzone"
        data-active={isDragActive}
        data-uploading={uploading}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Center>
            <Stack align="center" gap="xs">
              <Loader size="md" />
              <Text size="sm" c="dimmed">{status}</Text>
            </Stack>
          </Center>
        ) : (
          <Stack align="center" gap={6}>
            <ThemeIcon size={56} radius="xl" variant="light">
              <IconCloudUpload size={30} />
            </ThemeIcon>
            <Text fw={600} mt={4}>
              {isDragActive ? 'Drop receipt images here...' : 'Drag & drop receipt photos here, or click to select'}
            </Text>
            <Text size="xs" c="dimmed">You can upload multiple pages at once · JPG, PNG, WEBP, BMP, TIFF</Text>
          </Stack>
        )}
      </div>

      {(extractedCount > 0 || processingMs !== null) && (
        <Group justify="space-between" align="center">
          <Group gap="sm">
            {extractedCount > 0 && (
              <Badge size="lg" color="green" variant="light" leftSection={<IconCircleCheck size={14} />}>
                {extractedCount} item{extractedCount !== 1 ? 's' : ''} extracted
              </Badge>
            )}
            {processingMs !== null && (
              <Badge size="lg" color="blue" variant="light" leftSection={<IconBolt size={14} />}>
                OCR + LLM — {formatTime(processingMs)}
              </Badge>
            )}
          </Group>
          <Button variant="subtle" color="red" size="xs" leftSection={<IconRefresh size={14} />} loading={clearing} onClick={handleClear}>
            Clear all &amp; start over
          </Button>
        </Group>
      )}

    </Stack>
  )
}
