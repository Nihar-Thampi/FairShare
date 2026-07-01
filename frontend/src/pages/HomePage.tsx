import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Title, Button, TextInput, Group, Card, Text, Badge,
  Stack, SimpleGrid, Modal, ActionIcon, Loader, Center,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getBills, createBill, deleteBill } from '../api/bills'
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

export default function HomePage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    return <Center h={200}><Loader /></Center>
  }

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Your Bills</Title>
        <Button onClick={() => { setCreateOpen(true); setNewName('') }}>
          + New Bill
        </Button>
      </Group>

      {bills.length === 0 ? (
        <Card withBorder p="xl" ta="center">
          <Text c="dimmed" size="lg">No bills yet. Create one to get started.</Text>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {bills.map(bill => (
            <Card
              key={bill.id}
              withBorder
              p="md"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/bills/${bill.id}`)}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={600} lineClamp={1} style={{ flex: 1 }}>{bill.name}</Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label="Delete bill"
                  onClick={e => { e.stopPropagation(); setDeleteTarget({ id: bill.id, name: bill.name }) }}
                >
                  ×
                </ActionIcon>
              </Group>
              <Badge color={STATUS_COLORS[bill.status] ?? 'gray'} size="sm">
                {STATUS_LABELS[bill.status] ?? bill.status}
              </Badge>
              <Text size="xs" c="dimmed" mt="xs">
                {new Date(bill.created_at).toLocaleDateString()}
              </Text>
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
            <Button color="red" onClick={handleDeleteConfirm} loading={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
