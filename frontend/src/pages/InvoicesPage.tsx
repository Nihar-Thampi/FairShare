import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Title, Button, TextInput, Group, Card, Text, Stack, Modal, ActionIcon, Loader,
  Center, ThemeIcon, Tooltip, SegmentedControl, Table, ScrollArea, VisuallyHidden, Select,
} from '@mantine/core'
import {
  IconCircleCheck, IconCircleDashed, IconDownload, IconFileInvoice,
  IconPencil, IconPlus, IconSearch, IconTrash,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { getBills, createBill, deleteBill, updateBill } from '../api/bills'
import RenameBillModal from '../components/bill/RenameBillModal'
import PaymentBadge from '../components/invoice/PaymentBadge'
import type { BillSummary } from '../types'
import {
  type PaymentState, downloadTextFile, formatDate, formatMoney, invoicesToCsv, paymentState,
  sumByCurrency, todayIso,
} from '../utils/invoice'

type StatusFilter = 'all' | PaymentState

interface StatCellProps {
  label: string
  value: string
  hint: string
  tone?: 'overdue'
}

/** One figure of the statement strip; money in the receipt's monospaced figures. */
function StatCell({ label, value, hint, tone }: StatCellProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text size="sm" c="dimmed" fw={500}>{label}</Text>
      <Text className="fs-amount" fw={600} fz={{ base: 17, sm: 22 }} lh={1.25} mt={6} c={tone === 'overdue' ? 'red.7' : undefined} style={{ overflowWrap: 'anywhere' }}>
        {value}
      </Text>
      <Text size="xs" c="dimmed" mt={4}>{hint}</Text>
    </div>
  )
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState<BillSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getBills(controller.signal)
      .then(setBills)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === 'canceled') return
        notifications.show({ message: 'Failed to load invoices', color: 'red' })
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const categories = useMemo(
    () => [...new Set(bills.map(b => b.category).filter((c): c is string => !!c))].sort(),
    [bills],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bills.filter(b => {
      if (statusFilter !== 'all' && paymentState(b) !== statusFilter) return false
      if (categoryFilter && b.category !== categoryFilter) return false
      if (!q) return true
      return [b.name, b.vendor_name, b.invoice_number].some(v => v?.toLowerCase().includes(q))
    })
  }, [bills, search, statusFilter, categoryFilter])

  const stats = useMemo(() => {
    const unpaid = bills.filter(b => b.payment_status !== 'paid')
    const overdue = unpaid.filter(b => paymentState(b) === 'overdue')
    const thisMonth = todayIso().slice(0, 7)
    const paidThisMonth = bills.filter(b => b.payment_status === 'paid' && b.paid_at?.startsWith(thisMonth))
    return { unpaid, overdue, paidThisMonth, needsScan: bills.filter(b => b.item_count === 0).length }
  }, [bills])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const bill = await createBill()
      navigate(`/invoices/${bill.id}`)
    } catch {
      notifications.show({ message: 'Failed to create invoice', color: 'red' })
      setCreating(false)
    }
  }

  const handleTogglePaid = async (bill: BillSummary) => {
    setTogglingId(bill.id)
    try {
      const updated = await updateBill(bill.id, {
        payment_status: bill.payment_status === 'paid' ? 'unpaid' : 'paid',
      })
      setBills(prev => prev.map(b => b.id === bill.id ? { ...b, ...updated } : b))
    } catch (e: unknown) {
      notifications.show({ message: e instanceof Error ? e.message : 'Failed to update invoice', color: 'red' })
    } finally {
      setTogglingId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteBill(deleteTarget.id)
      setBills(prev => prev.filter(b => b.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      notifications.show({ message: 'Failed to delete invoice', color: 'red' })
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = () => {
    downloadTextFile(`invoices-${todayIso()}.csv`, invoicesToCsv(filtered))
  }

  if (loading) {
    return <Center h={240}><Loader /></Center>
  }

  const isPaid = (b: BillSummary) => b.payment_status === 'paid'

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Invoices</Title>
          <Text c="dimmed" size="sm" mt={2}>
            {bills.length === 0
              ? 'Scan an invoice or receipt to extract its details and line items.'
              : `${bills.length} invoice${bills.length !== 1 ? 's' : ''}`}
          </Text>
        </div>
        <Group gap="sm">
          {bills.length > 0 && (
            <Button variant="default" leftSection={<IconDownload size={16} />} onClick={handleExport}
              disabled={filtered.length === 0}>
              Export CSV
            </Button>
          )}
          <Button leftSection={<IconPlus size={16} />} onClick={handleCreate} loading={creating}>
            New invoice
          </Button>
        </Group>
      </Group>

      {bills.length > 0 && (
        <div className="fs-statement">
          <StatCell
            label="Outstanding"
            value={sumByCurrency(stats.unpaid, b => b.total)}
            hint={`${stats.unpaid.length} unpaid`}
          />
          <StatCell
            label="Overdue"
            value={sumByCurrency(stats.overdue, b => b.total)}
            hint={`${stats.overdue.length} past due date`}
            tone={stats.overdue.length ? 'overdue' : undefined}
          />
          <StatCell
            label="Paid this month"
            value={sumByCurrency(stats.paidThisMonth, b => b.total)}
            hint={`${stats.paidThisMonth.length} invoice${stats.paidThisMonth.length !== 1 ? 's' : ''}`}
          />
          <StatCell
            label="Invoices"
            value={String(bills.length)}
            hint={stats.needsScan > 0 ? `${stats.needsScan} not scanned yet` : 'All scanned'}
          />
        </div>
      )}

      {bills.length === 0 ? (
        <Card p={48} ta="center" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="sm">
            <ThemeIcon size={56} radius="xl" variant="light">
              <IconFileInvoice size={28} />
            </ThemeIcon>
            <Text fw={600} size="lg">No invoices yet</Text>
            <Text c="dimmed" size="sm">
              Upload a photo of an invoice or receipt. The vendor, dates, totals and line items are filled in for you.
            </Text>
            <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={handleCreate} loading={creating}>
              Add your first invoice
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card p={0}>
          <Group p="md" gap="sm" wrap="wrap">
            <TextInput
              placeholder="Search vendor, invoice number or name"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={e => setSearch(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 220 }}
              aria-label="Search invoices"
            />
            <SegmentedControl
              value={statusFilter}
              onChange={v => setStatusFilter(v as StatusFilter)}
              aria-label="Filter by payment status"
              data={[
                { value: 'all', label: 'All' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'paid', label: 'Paid' },
              ]}
            />
            {categories.length > 0 && (
              <Select
                placeholder="All categories"
                data={categories}
                value={categoryFilter}
                onChange={setCategoryFilter}
                clearable
                w={190}
                aria-label="Filter by category"
              />
            )}
          </Group>

          <ScrollArea>
            <Table className="fs-table" highlightOnHover verticalSpacing="sm" horizontalSpacing="md" miw={760}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Invoice</Table.Th>
                  <Table.Th w={120}>Date</Table.Th>
                  <Table.Th w={120}>Due</Table.Th>
                  <Table.Th w={140} ta="right">Amount</Table.Th>
                  <Table.Th w={110}>Status</Table.Th>
                  <Table.Th w={120}><VisuallyHidden>Actions</VisuallyHidden></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text ta="center" c="dimmed" size="sm" py="lg">No invoices match these filters.</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {filtered.map(bill => (
                  <Table.Tr
                    key={bill.id}
                    className="fs-click-row"
                    tabIndex={0}
                    onClick={() => navigate(`/invoices/${bill.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter') navigate(`/invoices/${bill.id}`) }}
                  >
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon size={32} radius="md" variant="light">
                          <IconFileInvoice size={17} />
                        </ThemeIcon>
                        <div style={{ minWidth: 0 }}>
                          <Text fw={600} size="sm" lineClamp={1}>{bill.vendor_name || bill.name}</Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {[bill.invoice_number && `#${bill.invoice_number}`, bill.category,
                              bill.item_count === 0 && 'Not scanned yet']
                              .filter(Boolean).join(' · ') || bill.name}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">{formatDate(bill.invoice_date ?? bill.created_at)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={paymentState(bill) === 'overdue' ? 'red' : 'dimmed'}>
                        {formatDate(bill.due_date)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {bill.item_count === 0
                        ? <Text size="sm" c="dimmed">—</Text>
                        : <Text size="sm" fw={600} className="fs-amount">{formatMoney(bill.total, bill.currency)}</Text>}
                    </Table.Td>
                    <Table.Td><PaymentBadge bill={bill} /></Table.Td>
                    <Table.Td ta="right">
                      <Group gap={2} wrap="nowrap" justify="flex-end"
                        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <Tooltip label={isPaid(bill) ? 'Mark as unpaid' : 'Mark as paid'} withArrow>
                          <ActionIcon
                            variant="subtle"
                            color={isPaid(bill) ? 'gray' : 'green'}
                            aria-label={isPaid(bill) ? 'Mark as unpaid' : 'Mark as paid'}
                            loading={togglingId === bill.id}
                            onClick={() => handleTogglePaid(bill)}
                          >
                            {isPaid(bill) ? <IconCircleDashed size={16} /> : <IconCircleCheck size={16} />}
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Rename" withArrow>
                          <ActionIcon variant="subtle" color="gray" aria-label="Rename invoice"
                            onClick={() => setRenameTarget({ id: bill.id, name: bill.name })}>
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" withArrow>
                          <ActionIcon variant="subtle" color="gray" aria-label="Delete invoice"
                            onClick={() => setDeleteTarget({ id: bill.id, name: bill.vendor_name || bill.name })}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      <RenameBillModal
        bill={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={updated =>
          setBills(prev => prev.map(b => b.id === updated.id ? { ...b, name: updated.name } : b))
        }
      />

      <Modal
        opened={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete invoice"
        size="sm"
      >
        <Stack>
          <Text size="sm">
            Delete <strong>{deleteTarget?.name}</strong>? This permanently removes the invoice, its
            scanned images and line items, and any bill split.
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="red" leftSection={<IconTrash size={16} />} onClick={handleDeleteConfirm} loading={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
