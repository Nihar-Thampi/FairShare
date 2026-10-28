import { useState } from 'react'
import { Group, TextInput, Button, Badge, ActionIcon, Stack, Text } from '@mantine/core'
import { IconUserPlus, IconX } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import type { Person } from '../../types'

interface Props {
  billId: number
  persons: Person[]
  onAdd: (name: string) => Promise<void>
  onRemove: (personId: number) => Promise<void>
}

export default function PersonManager({ persons, onAdd, onRemove }: Props) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) return
    setAdding(true)
    try {
      await onAdd(name.trim())
      setName('')
    } catch (e: unknown) {
      notifications.show({
        message: e instanceof Error ? e.message : 'Failed to add person',
        color: 'red',
      })
    } finally {
      setAdding(false)
    }
  }

  return (
    <Stack gap="sm">
      <div>
        <Text fw={600}>People on this bill</Text>
        <Text size="sm" c="dimmed">Everyone who is sharing this bill.</Text>
      </div>

      {persons.length === 0 && (
        <Text size="sm" c="dimmed">No people added yet. Add at least 2.</Text>
      )}

      <Group gap="xs" wrap="wrap">
        {persons.map(p => (
          <Badge
            key={p.id}
            style={{ background: p.color, color: '#fff' }}
            size="xl"
            radius="xl"
            tt="none"
            pr={4}
            rightSection={
              <ActionIcon
                size="xs"
                variant="transparent"
                color="white"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                <IconX size={12} />
              </ActionIcon>
            }
          >
            {p.name}
          </Badge>
        ))}
      </Group>

      <Group gap="xs" maw={480}>
        <TextInput
          placeholder="Person's name"
          value={name}
          onChange={e => setName(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          size="sm"
          style={{ flex: 1 }}
        />
        <Button size="sm" leftSection={<IconUserPlus size={16} />} onClick={handleAdd} loading={adding} disabled={!name.trim()}>
          Add
        </Button>
      </Group>
    </Stack>
  )
}
