import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Title, Button, TextInput, Group, Card, Text, Badge,
  Stack, SimpleGrid, Modal, ActionIcon, Loader, Center, ThemeIcon, Tooltip,
  SegmentedControl, Table, ScrollArea, VisuallyHidden,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import {
  IconCalendar, IconLayoutGrid, IconList, IconPencil, IconPlus, IconReceipt, IconTrash,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { getBills, createBill, deleteBill } from '../api/bills'
import RenameBillModal from '../components/bill/RenameBillModal'
import type { Bill } from '../types'

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

type ViewMode = 'grid' | 'list'

export default function HomePage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null)
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>({
    key: 'fairshare-bills-view',
    defaultValue: 'grid',
  })

  useEffect(() => {
    const controller = new AbortController()
    getBills(controller.signal)
      .then(setBills)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === 'canceled') return
        notifications.show({ message: 'Failed to load bills', color: 'red' })
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const bill = await createBill(newName.trim())
      navigate(`/bills/${bill.id}`)
    } catch {
      notifications.show({ message: 'Failed to create bill', color: 'red' })
    } finally {
      setCreating(false)
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
      notifications.show({ message: 'Failed to delete bill', color: 'red' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <Center h={240}><Loader /></Center>
  }

  const openCreate = () => { setCreateOpen(true); setNewName('') }

  const billActions = (bill: Bill) => (
    <Group gap={2} wrap="nowrap" justify="flex-end">
      <Tooltip label="Rename bill" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Rename bill"
          onClick={e => { e.stopPropagation(); setRenameTarget({ id: bill.id, name: bill.name }) }}
          onKeyDown={e => e.stopPropagation()}
        >
          <IconPencil size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete bill" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Delete bill"
          onClick={e => { e.stopPropagation(); setDeleteTarget({ id: bill.id, name: bill.name }) }}
          onKeyDown={e => e.stopPropagation()}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )

  const statusBadge = (bill: Bill) => (
    <Badge color={STATUS_COLORS[bill.status] ?? 'gray'} variant="light">
      {STATUS_LABELS[bill.status] ?? bill.status}
    </Badge>
  )

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Your Bills</Title>
          <Text c="dimmed" size="sm" mt={2}>
            {bills.length === 0
              ? 'Scan a receipt and split it in a few clicks.'
              : `${bills.length} bill${bills.length !== 1 ? 's' : ''}`}
          </Text>
        </div>
        <Group gap="sm">
          {bills.length > 0 && (
            <SegmentedControl
              value={viewMode}
              onChange={v => setViewMode(v as ViewMode)}
              aria-label="Bills view"
              data={[
                {
                  value: 'grid',
                  label: (
                    <Center>
                      <IconLayoutGrid size={16} />
                      <VisuallyHidden>Grid view</VisuallyHidden>
                    </Center>
                  ),
                },
                {
                  value: 'list',
                  label: (
                    <Center>
                      <IconList size={16} />
                      <VisuallyHidden>List view</VisuallyHidden>
                    </Center>
                  ),
                },
              ]}
            />
          )}
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            New Bill
          </Button>
        </Group>
      </Group>

      {bills.length === 0 ? (
        <Card p={48} ta="center" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="sm">
            <ThemeIcon size={56} radius="xl" variant="light">
              <IconReceipt size={28} />
            </ThemeIcon>
            <Text fw={600} size="lg">No bills yet</Text>
            <Text c="dimmed" size="sm">Create one to get started.</Text>
            <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Create your first bill
            </Button>
          </Stack>
        </Card>
      ) : viewMode === 'list' ? (
        <Card p={0} shadow="xs">
          <ScrollArea>
            <Table className="fs-table" highlightOnHover verticalSpacing="sm" horizontalSpacing="md" miw={520}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Bill</Table.Th>
                  <Table.Th w={170}>Status</Table.Th>
                  <Table.Th w={130}>Created</Table.Th>
                  <Table.Th w={90}><VisuallyHidden>Actions</VisuallyHidden></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bills.map(bill => (
                  <Table.Tr
                    key={bill.id}
                    className="fs-click-row"
                    tabIndex={0}
                    onClick={() => navigate(`/bills/${bill.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter') navigate(`/bills/${bill.id}`) }}
                  >
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon size={30} radius="md" variant="light">
                          <IconReceipt size={16} />
                        </ThemeIcon>
                        <Text fw={600} size="sm" lineClamp={1}>{bill.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{statusBadge(bill)}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {new Date(bill.created_at).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{billActions(bill)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {bills.map(bill => (
            <Card
              key={bill.id}
              p="lg"
              shadow="xs"
              className="fs-hover-card"
              onClick={() => navigate(`/bills/${bill.id}`)}
            >
              <Group justify="space-between" wrap="nowrap" mb="md" align="flex-start">
                <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                  <ThemeIcon size={38} radius="md" variant="light">
                    <IconReceipt size={20} />
                  </ThemeIcon>
                  <Text fw={600} lineClamp={1} style={{ flex: 1 }}>{bill.name}</Text>
                </Group>
                {billActions(bill)}
              </Group>
              <Group justify="space-between">
                {statusBadge(bill)}
                <Group gap={4}>
                  <IconCalendar size={14} color="var(--mantine-color-gray-5)" />
                  <Text size="xs" c="dimmed">
                    {new Date(bill.created_at).toLocaleDateString()}
                  </Text>
                </Group>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* Create bill modal */}
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New Bill">
        <Stack>
          <TextInput
            label="Bill name"
            placeholder="e.g. Dinner at Joe's"
            value={newName}
            onChange={e => setNewName(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <RenameBillModal
        bill={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={updated =>
          setBills(prev => prev.map(b => b.id === updated.id ? { ...b, name: updated.name } : b))
        }
      />

      {/* Delete confirmation modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete bill"
        size="sm"
      >
        <Stack>
          <Text size="sm">
            Delete <strong>{deleteTarget?.name}</strong>? This permanently removes the bill and all
            its items, people, and assignments.
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
