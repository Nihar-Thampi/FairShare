import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack, Title, Tabs, Text, Loader, Center, Breadcrumbs, Anchor, Group, Paper, Badge,
  ActionIcon, Tooltip,
} from '@mantine/core'
import { IconCalculator, IconListDetails, IconPencil, IconUpload, IconUsers } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { getBill, clearItems } from '../api/bills'
import { getLLMHealth } from '../api/calculate'
import { getAssignments } from '../api/assignments'
import { useBillStore } from '../store/billStore'
import { usePersons } from '../hooks/usePersons'
import { useCalculation } from '../hooks/useCalculation'
import ReceiptUploader from '../components/upload/ReceiptUploader'
import ImageEditor from '../components/upload/ImageEditor'
import ItemList from '../components/bill/ItemList'
import PersonManager from '../components/persons/PersonManager'
import AssignmentPanel from '../components/assignment/AssignmentPanel'
import ResultsTable from '../components/results/ResultsTable'
import ReceiptViewer from '../components/results/ReceiptViewer'
import RenameBillModal from '../components/bill/RenameBillModal'
import { replaceBillImage } from '../api/bills'
import type { BillItem, Assignment } from '../types'

const STATUS_COLORS: Record<string, string> = {
  draft: 'gray',
  ocr_pending: 'yellow',
  ocr_done: 'blue',
  assigned: 'violet',
  calculated: 'green',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ocr_pending: 'Processing...',
  ocr_done: 'Items Extracted',
  assigned: 'Assigned',
  calculated: 'Calculated',
}

export default function BillPage() {
  const { id } = useParams<{ id: string }>()
  const billId = Number(id)
  const navigate = useNavigate()

  const { bill, setBill, items, setItems, persons, assignments, setAssignments, updateItemAssignments, results } = useBillStore()
  const { fetchPersons, addPersonToBill, removePersonFromBill } = usePersons()
  const { loading: calcLoading, error: calcError, calculate, fetchResults } = useCalculation()

  const [pageLoading, setPageLoading] = useState(true)
  const [ocrOk, setOllamaOk] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('upload')
  const [reEditImage, setReEditImage] = useState<{ filename: string; file: File } | null>(null)
  const [receiptRefreshKey, setReceiptRefreshKey] = useState(0)
  const [renameOpen, setRenameOpen] = useState(false)

  // Load bill, persons, assignments and check LLM health
  useEffect(() => {
    if (!billId) { navigate('/'); return }

    const controller = new AbortController()
    const { signal } = controller

    // Health check is non-blocking — its 503 must not prevent the bill from loading
    getLLMHealth(signal).then(h => setOllamaOk(h.status === 'ok')).catch(() => setOllamaOk(false))

    Promise.all([
      getBill(billId, signal),
      fetchPersons(billId, signal),
    ]).then(([billData]) => {
      setBill(billData)
      setItems(billData.items ?? [])

      getAssignments(billId).then(setAssignments).catch(() => {})

      if (billData.status === 'calculated') {
        fetchResults(billId).catch(() => {})
        setActiveTab('results')
      } else if (billData.status === 'ocr_done' || billData.status === 'assigned') {
        setActiveTab('assign')
      } else if (billData.status !== 'draft') {
        setActiveTab('items')
      }
    }).catch((e: unknown) => {
      if (e instanceof Error && e.message === 'canceled') return
      notifications.show({ message: 'Failed to load bill', color: 'red' })
      navigate('/')
    }).finally(() => setPageLoading(false))

    return () => controller.abort()
  }, [billId])

  const handleOcrComplete = useCallback((newItems: BillItem[], businessName: string | null) => {
    setItems(newItems)
    if (businessName && bill) {
      setBill({ ...bill, name: businessName, status: 'ocr_done' })
    }
    setActiveTab('items')
    notifications.show({ message: 'Review and edit the extracted items', color: 'blue' })
  }, [bill, setBill, setItems])

  const handleAssignmentsChange = useCallback((itemId: number, saved: Assignment[]) => {
    updateItemAssignments(itemId, saved)
  }, [updateItemAssignments])

  const handleReEditConfirm = useCallback(async (newFile: File) => {
    if (!reEditImage) return
    await replaceBillImage(billId, reEditImage.filename, newFile)
    setReEditImage(null)
    setReceiptRefreshKey(k => k + 1)
  }, [billId, reEditImage])

  const handleClearItems = async () => {
    await clearItems(billId)
    setItems([])
    if (bill) setBill({ ...bill, status: 'draft' })
  }

  const handleCalculate = async () => {
    const res = await calculate(billId)
    if (res) {
      if (bill) setBill({ ...bill, status: 'calculated' })
      setActiveTab('results')
    }
  }

  if (pageLoading) {
    return <Center h={300}><Loader size="lg" /></Center>
  }

  if (!bill) return null

  return (
    <>
    {reEditImage && (
      <ImageEditor
        file={reEditImage.file}
        onConfirm={handleReEditConfirm}
        onCancel={() => setReEditImage(null)}
      />
    )}
    <RenameBillModal
      bill={renameOpen ? bill : null}
      onClose={() => setRenameOpen(false)}
      onRenamed={updated => setBill({ ...bill, name: updated.name })}
    />
    <Stack gap="lg">
      <Stack gap={6}>
        <Breadcrumbs>
          <Anchor component={Link} to="/" size="sm">Bills</Anchor>
          <Text size="sm" c="dimmed">{bill.name}</Text>
        </Breadcrumbs>

        <Group justify="space-between" align="center">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Title order={2} lineClamp={1}>{bill.name}</Title>
            <Tooltip label="Rename bill" withArrow>
              <ActionIcon variant="subtle" color="gray" aria-label="Rename bill" onClick={() => setRenameOpen(true)}>
                <IconPencil size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Badge size="lg" variant="light" color={STATUS_COLORS[bill.status] ?? 'gray'}>
            {STATUS_LABELS[bill.status] ?? bill.status}
          </Badge>
        </Group>
      </Stack>

      <Tabs value={activeTab} onChange={v => setActiveTab(v ?? 'upload')} variant="pills" radius="md">
        <Paper withBorder p={6} shadow="xs" mb="md">
          <Tabs.List>
            <Tabs.Tab value="upload" leftSection={<IconUpload size={16} />}>1. Upload Receipt</Tabs.Tab>
            <Tabs.Tab value="items" leftSection={<IconListDetails size={16} />}>2. Review Items</Tabs.Tab>
            <Tabs.Tab value="assign" leftSection={<IconUsers size={16} />}>3. Assign</Tabs.Tab>
            <Tabs.Tab value="results" leftSection={<IconCalculator size={16} />}>4. Results</Tabs.Tab>
          </Tabs.List>
        </Paper>

        <Tabs.Panel value="upload">
          <Paper withBorder shadow="xs" p="lg">
            <Stack>
              <ReceiptUploader
                billId={billId}
                ocrOk={ocrOk}
                onComplete={handleOcrComplete}
                onClear={handleClearItems}
                extractedCount={items.length}
              />
              <ReceiptViewer
                billId={billId}
                imagePath={bill.image_path ?? null}
                refreshKey={receiptRefreshKey}
                onImageDeleted={setBill}
                onEdit={(filename, file) => setReEditImage({ filename, file })}
              />
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="items">
          <Paper withBorder shadow="xs" p="lg">
            <ItemList
              billId={billId}
              items={items}
              onChange={setItems}
            />
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="assign">
          <Stack>
            <Paper withBorder shadow="xs" p="lg">
              <PersonManager
                billId={billId}
                persons={persons}
                onAdd={(name) => addPersonToBill(billId, name).then(() => {})}
                onRemove={removePersonFromBill}
              />
            </Paper>
            <Paper withBorder shadow="xs" p="lg">
              <AssignmentPanel
                billId={billId}
                items={items}
                persons={persons}
                assignments={assignments}
                onAssignmentsChange={handleAssignmentsChange}
                onAllAssignmentsChange={setAssignments}
              />
            </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="results">
          <Stack>
            <Paper withBorder shadow="xs" p="lg">
              <ResultsTable
                billId={billId}
                results={results}
                loading={calcLoading}
                error={calcError}
                onCalculate={handleCalculate}
              />
            </Paper>
            <ReceiptViewer billId={billId} imagePath={bill.image_path ?? null} />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
    </>
  )
}
