import { useEffect, useState } from 'react'
import { Modal, Stack, TextInput, Group, Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { updateBill } from '../../api/bills'
import type { Bill } from '../../types'

interface Props {
  bill: { id: number; name: string } | null
  onClose: () => void
  onRenamed: (updated: Bill) => void
}

export default function RenameBillModal({ bill, onClose, onRenamed }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (bill) setName(bill.name)
  }, [bill])

  const trimmed = name.trim()
  const unchanged = !!bill && trimmed === bill.name

  const handleSave = async () => {
    if (!bill || !trimmed) return
    if (unchanged) { onClose(); return }
    setSaving(true)
    try {
      const updated = await updateBill(bill.id, { name: trimmed })
      onRenamed(updated)
      onClose()
    } catch (e: unknown) {
      notifications.show({
        message: e instanceof Error ? e.message : 'Failed to rename bill',
        color: 'red',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={!!bill} onClose={() => !saving && onClose()} title="Rename bill">
      <Stack>
        <TextInput
          label="Bill name"
          placeholder="e.g. Dinner at Joe's"
          value={name}
          onChange={e => setName(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          error={name && !trimmed ? 'Name cannot be empty' : undefined}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!trimmed}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
