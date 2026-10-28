import { useState } from 'react'
import { Stack, Text, Table, Badge, ScrollArea, Checkbox, Tooltip, ThemeIcon } from '@mantine/core'
import { IconListDetails, IconUsers } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import type { BillItem, Person, Assignment } from '../../types'
import { bulkAssignPerson, bulkRemovePerson } from '../../api/assignments'
import ItemAssignmentRow from './ItemAssignmentRow'

interface Props {
  billId: number
  items: BillItem[]
  persons: Person[]
  assignments: Assignment[]
  onAssignmentsChange: (itemId: number, saved: Assignment[]) => void
  onAllAssignmentsChange: (all: Assignment[]) => void
}

export default function AssignmentPanel({ billId, items, persons, assignments, onAssignmentsChange, onAllAssignmentsChange }: Props) {
  const [loadingPersonId, setLoadingPersonId] = useState<number | null>(null)

  if (persons.length < 2) {
    return (
      <Stack align="center" gap="sm" py="xl">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          <IconUsers size={28} />
        </ThemeIcon>
        <Text c="dimmed" ta="center">
          Add at least 2 people above before assigning items.
        </Text>
      </Stack>
    )
  }

  if (items.length === 0) {
    return (
      <Stack align="center" gap="sm" py="xl">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          <IconListDetails size={28} />
        </ThemeIcon>
        <Text c="dimmed" ta="center">
          No items to assign. Add items in the previous step.
        </Text>
      </Stack>
    )
  }

  const getItemAssignments = (itemId: number) =>
    assignments.filter(a => a.item_id === itemId)

  // Tax lines always go to the bottom, matching the review items order
  const sortedItems = [...items].sort((a, b) => (a.is_tax_line ?? 0) - (b.is_tax_line ?? 0))
  const nonTaxItems = sortedItems.filter(i => !i.is_tax_line)

  /** How many non-tax items include this person. */
  const personCount = (personId: number) =>
    nonTaxItems.filter(item => assignments.some(a => a.item_id === item.id && a.person_id === personId)).length

  /** Toggle a person across all non-tax items — single bulk API call. */
  const handlePersonSelectAll = async (personId: number) => {
    const adding = personCount(personId) < nonTaxItems.length
    setLoadingPersonId(personId)
    try {
      const all = adding
        ? await bulkAssignPerson(billId, personId)
        : await bulkRemovePerson(billId, personId)
      onAllAssignmentsChange(all)
    } catch (e: unknown) {
      notifications.show({
        message: e instanceof Error ? e.message : 'Failed to update assignments',
        color: 'red',
      })
    } finally {
      setLoadingPersonId(null)
    }
  }

  return (
    <Stack>
      <div>
        <Text fw={600}>Assign items</Text>
        <Text size="sm" c="dimmed">
          Check who shares each item. Tax lines are always split equally.
        </Text>
      </div>

      <ScrollArea>
        <Table className="fs-table" withTableBorder withColumnBorders highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th miw={160}>Item</Table.Th>
              <Table.Th ta="center" w={56}>All</Table.Th>
              {persons.map(p => {
                const count = personCount(p.id)
                const allChecked = count === nonTaxItems.length
                const someChecked = count > 0 && count < nonTaxItems.length
                const busy = loadingPersonId === p.id
                return (
                  <Table.Th key={p.id} ta="center" w={80}>
                    <Stack gap={4} align="center">
                      <Badge size="sm" tt="none" style={{ background: p.color, color: '#fff' }}>
                        {p.name}
                      </Badge>
                      <Tooltip label={allChecked ? `Remove ${p.name} from all` : `Add ${p.name} to all`} withArrow>
                        <Checkbox
                          checked={allChecked}
                          indeterminate={someChecked}
                          disabled={busy || loadingPersonId !== null}
                          onChange={() => handlePersonSelectAll(p.id)}
                          color={p.color}
                          size="xs"
                        />
                      </Tooltip>
                    </Stack>
                  </Table.Th>
                )
              })}
              <Table.Th miw={200}>Split type</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedItems.map(item => (
              <ItemAssignmentRow
                key={item.id}
                item={item}
                persons={persons}
                assignments={getItemAssignments(item.id)}
                onSaved={onAssignmentsChange}
              />
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  )
}
