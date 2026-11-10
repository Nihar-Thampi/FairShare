import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Stack, Title, Tabs, Text, Loader, Center, Breadcrumbs, Anchor, Group, Paper, ActionIcon, Tooltip,
  Button, Divider,
} from '@mantine/core'
import {
  IconCircleCheck, IconCircleDashed, IconFileDescription, IconPencil, IconScan, IconUsersGroup,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { getBill, clearItems, replaceBillImage, updateBill } from '../api/bills'
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
import InvoiceDetailsForm from '../components/invoice/InvoiceDetailsForm'
import InvoiceTotals from '../components/invoice/InvoiceTotals'
import PaymentBadge from '../components/invoice/PaymentBadge'
import type { Bill, BillItem, Assignment } from '../types'
import { formatDate } from '../utils/invoice'

type InvoiceTab = 'scan' | 'details' | 'split'

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const billId = Number(id)
  const navigate = useNavigate()

  const { bill, setBill, items, setItems, persons, assignments, setAssignments, updateItemAssignments, results } = useBillStore()
  const { fetchPersons, addPersonToBill, removePersonFromBill } = usePersons()
  const { loading: calcLoading, error: calcError, calculate, fetchResults } = useCalculation()

  const [pageLoading, setPageLoading] = useState(true)
  const [ocrOk, setOcrOk] = useState(true)
  const [activeTab, setActiveTab] = useState<InvoiceTab>('scan')
  const [reEditImage, setReEditImage] = useState<{ filename: string; file: File } | null>(null)
  const [receiptRefreshKey, setReceiptRefreshKey] = useState(0)
  const [renameOpen, setRenameOpen] = useState(false)
  const [togglingPaid, setTogglingPaid] = useState(false)
  // Bumped when a scan or "start over" changes invoice fields on the server, so the
  // details form reloads them. Other updates (e.g. mark as paid) keep unsaved edits.
  const [scanVersion, setScanVersion] = useState(0)

  // Load invoice, people, assignments and check LLM health
  useEffect(() => {
    if (!billId) { navigate('/'); return }

    const controller = new AbortController()
    const { signal } = controller

    // Health check is non-blocking — its 503 must not prevent the invoice from loading
    getLLMHealth(signal).then(h => setOcrOk(h.status === 'ok')).catch(() => setOcrOk(false))

    Promise.all([
      getBill(billId, signal),
      fetchPersons(billId, signal),
    ]).then(([billData]) => {
      setBill(billData)
      setItems(billData.items ?? [])

      getAssignments(billId).then(setAssignments).catch(() => {})
      if (billData.status === 'calculated') fetchResults(billId).catch(() => {})

      setActiveTab(billData.items?.length ? 'details' : 'scan')
    }).catch((e: unknown) => {
      if (e instanceof Error && e.message === 'canceled') return
      notifications.show({ message: 'Failed to load invoice', color: 'red' })
      navigate('/')
    }).finally(() => setPageLoading(false))

    return () => controller.abort()
  }, [billId])

  const handleOcrComplete = useCallback((newItems: BillItem[], updated: Bill) => {
    setItems(newItems)
    setBill(updated)
    setScanVersion(v => v + 1)
    setActiveTab('details')
    notifications.show({ message: 'Check the extracted details and line items', color: 'blue' })
  }, [setBill, setItems])

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
    // Scan-derived fields are cleared on the server too, so reload the invoice
    setBill(await getBill(billId))
    setScanVersion(v => v + 1)
  }

  const handleCalculate = async () => {
    const res = await calculate(billId)
    if (res && bill) setBill({ ...bill, status: 'calculated' })
  }

  const handleTogglePaid = async () => {
    if (!bill) return
    setTogglingPaid(true)
    try {
      setBill(await updateBill(billId, { payment_status: bill.payment_status === 'paid' ? 'unpaid' : 'paid' }))
    } catch (e: unknown) {
      notifications.show({ message: e instanceof Error ? e.message : 'Failed to update invoice', color: 'red' })
    } finally {
      setTogglingPaid(false)
    }
  }

  if (pageLoading) {
    return <Center h={300}><Loader size="lg" /></Center>
  }

  if (!bill) return null

  const isPaid = bill.payment_status === 'paid'
  const subtitle = [
    bill.vendor_name && bill.vendor_name !== bill.name && bill.vendor_name,
    bill.invoice_number && `#${bill.invoice_number}`,
    bill.due_date && !isPaid && `Due ${formatDate(bill.due_date)}`,
    isPaid && bill.paid_at && `Paid ${formatDate(bill.paid_at)}`,
  ].filter(Boolean).join(' · ')

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
          <Anchor component={Link} to="/" size="sm">Invoices</Anchor>
          <Text size="sm" c="dimmed">{bill.name}</Text>
        </Breadcrumbs>

        <Group justify="space-between" align="center" wrap="wrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Title order={2} lineClamp={1}>{bill.name}</Title>
              <Tooltip label="Rename invoice" withArrow>
                <ActionIcon variant="subtle" color="gray" aria-label="Rename invoice" onClick={() => setRenameOpen(true)}>
                  <IconPencil size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {subtitle && <Text size="sm" c="dimmed">{subtitle}</Text>}
          </Stack>
          <Group gap="sm">
            <PaymentBadge bill={bill} size="lg" />
            <Button
              variant={isPaid ? 'default' : 'filled'}
              color={isPaid ? undefined : 'green'}
              leftSection={isPaid ? <IconCircleDashed size={16} /> : <IconCircleCheck size={16} />}
              loading={togglingPaid}
              onClick={handleTogglePaid}
            >
              {isPaid ? 'Mark as unpaid' : 'Mark as paid'}
            </Button>
          </Group>
        </Group>
      </Stack>

      <Tabs value={activeTab} onChange={v => setActiveTab((v as InvoiceTab) ?? 'scan')} variant="default">
        <Paper withBorder p={6} mb="md">
          <Tabs.List>
            <Tabs.Tab value="scan" leftSection={<IconScan size={16} />}>Scan</Tabs.Tab>
            <Tabs.Tab value="details" leftSection={<IconFileDescription size={16} />}>Details &amp; line items</Tabs.Tab>
            <Tabs.Tab value="split" leftSection={<IconUsersGroup size={16} />}>Split bill</Tabs.Tab>
          </Tabs.List>
        </Paper>

        <Tabs.Panel value="scan">
          <Paper withBorder p="lg">
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

        <Tabs.Panel value="details">
          <Stack>
            <Paper withBorder p="lg">
              <InvoiceDetailsForm
                key={`${bill.id}-${scanVersion}`}
                bill={bill}
                onSaved={updated => setBill({ ...bill, ...updated })}
              />
            </Paper>
            <Paper withBorder p="lg">
              <Stack>
                <ItemList billId={billId} items={items} onChange={setItems} />
                {items.length > 0 && (
                  <>
                    <Divider />
                    <InvoiceTotals items={items} currency={bill.currency} extractedTotal={bill.extracted_total} />
                  </>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="split">
          <Stack>
            <Text size="sm" c="dimmed">
              Optional: share this invoice between people. Add who was involved, assign each line
              item, and tax is split evenly.
            </Text>
            <Paper withBorder p="lg">
              <PersonManager
                billId={billId}
                persons={persons}
                onAdd={(name) => addPersonToBill(billId, name).then(() => {})}
                onRemove={removePersonFromBill}
              />
            </Paper>
            <Paper withBorder p="lg">
              <AssignmentPanel
                billId={billId}
                items={items}
                persons={persons}
                assignments={assignments}
                onAssignmentsChange={handleAssignmentsChange}
                onAllAssignmentsChange={setAssignments}
              />
            </Paper>
            <Paper withBorder p="lg">
              <ResultsTable
                billId={billId}
                results={results}
                loading={calcLoading}
                error={calcError}
                onCalculate={handleCalculate}
              />
            </Paper>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
    </>
  )
}
