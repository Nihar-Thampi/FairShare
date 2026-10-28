import { useState, useEffect } from 'react'
import { Table, Checkbox, Badge, Group, Text, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { BillItem, Person, Assignment, SplitType } from '../../types'
import SplitTypeSelector, { type PersonSplit } from './SplitTypeSelector'
import { replaceAssignments, clearAssignments } from '../../api/assignments'

interface Props {
  item: BillItem
  persons: Person[]
  assignments: Assignment[]
  onSaved: (itemId: number, saved: Assignment[]) => void
}

export default function ItemAssignmentRow({ item, persons, assignments, onSaved }: Props) {
  const isTax = item.is_tax_line === 1

  // Build initial splits state from existing assignments
  const buildSplits = (asgs: Assignment[]): PersonSplit[] =>
    asgs.map(a => ({
      person_id: a.person_id,
      split_type: a.split_type,
      split_value: a.split_value,
    }))

  const [checkedIds, setCheckedIds] = useState<number[]>(
    assignments.map(a => a.person_id)
  )
  const [splits, setSplits] = useState<PersonSplit[]>(buildSplits(assignments))

  useEffect(() => {
    setCheckedIds(assignments.map(a => a.person_id))
    setSplits(buildSplits(assignments))
  }, [assignments])

  const handleCheck = async (personId: number, checked: boolean) => {
    const newIds = checked
      ? [...checkedIds, personId]
      : checkedIds.filter(id => id !== personId)
    setCheckedIds(newIds)

    const currentType: SplitType = splits[0]?.split_type ?? 'equal'
    const newPersons = persons.filter(p => newIds.includes(p.id))
    let newSplits: PersonSplit[]

    if (newIds.length === 0) {
      newSplits = []
    } else if (currentType === 'equal') {
      newSplits = newPersons.map(p => ({ person_id: p.id, split_type: 'equal', split_value: null }))
    } else if (currentType === 'percentage') {
      newSplits = newPersons.map(p => ({
        person_id: p.id,
        split_type: 'percentage',
        split_value: parseFloat((100 / newPersons.length).toFixed(2)),
      }))
    } else {
      newSplits = newPersons.map(p => ({
        person_id: p.id,
        split_type: 'custom',
        split_value: parseFloat((item.total_price / newPersons.length).toFixed(2)),
      }))
    }

    setSplits(newSplits)
    await save(item.id, newSplits)
  }

  const handleCheckAll = async () => {
    const allChecked = persons.every(p => checkedIds.includes(p.id))
    if (allChecked) {
      setCheckedIds([])
      setSplits([])
      await save(item.id, [])
    } else {
      const newIds = persons.map(p => p.id)
      setCheckedIds(newIds)
      const currentType: SplitType = splits[0]?.split_type ?? 'equal'
      let newSplits: PersonSplit[]
      if (currentType === 'percentage') {
        newSplits = persons.map(p => ({
          person_id: p.id, split_type: 'percentage',
          split_value: parseFloat((100 / persons.length).toFixed(2)),
        }))
      } else if (currentType === 'custom') {
        newSplits = persons.map(p => ({
          person_id: p.id, split_type: 'custom',
          split_value: parseFloat((item.total_price / persons.length).toFixed(2)),
        }))
      } else {
        newSplits = persons.map(p => ({ person_id: p.id, split_type: 'equal', split_value: null }))
      }
      setSplits(newSplits)
      await save(item.id, newSplits)
    }
  }

  const handleSplitsChange = async (newSplits: PersonSplit[]) => {
    setSplits(newSplits)
    await save(item.id, newSplits)
  }

  const save = async (itemId: number, newSplits: PersonSplit[]) => {
    try {
      if (newSplits.length === 0) {
        await clearAssignments(itemId)
        onSaved(itemId, [])
      } else {
        const saved = await replaceAssignments(itemId, newSplits)
        onSaved(itemId, saved)
      }
    } catch (e: unknown) {
      notifications.show({
        message: e instanceof Error ? e.message : 'Failed to save assignment',
        color: 'red',
      })
    }
  }

  return (
    <Table.Tr className={isTax ? 'fs-tax-row' : undefined}>
      <Table.Td>
        <Stack gap={2}>
          <Group gap="xs">
            {isTax && <Badge color="yellow" size="xs">TAX</Badge>}
            <Text size="sm" fw={isTax ? 600 : undefined}>{item.name}</Text>
          </Group>
          <Text size="xs" c="dimmed">${item.total_price.toFixed(2)}</Text>
        </Stack>
      </Table.Td>

      {isTax ? (
        <Table.Td colSpan={persons.length + 2}>
          <Text size="xs" c="dimmed" fs="italic">Split equally among all people</Text>
        </Table.Td>
      ) : (
        <>
          <Table.Td ta="center">
            <Checkbox
              mx="auto"
              w="fit-content"
              aria-label={`Assign ${item.name} to everyone`}
              checked={persons.every(p => checkedIds.includes(p.id))}
              indeterminate={
                !persons.every(p => checkedIds.includes(p.id)) &&
                persons.some(p => checkedIds.includes(p.id))
              }
              onChange={handleCheckAll}
            />
          </Table.Td>
          {persons.map(p => (
            <Table.Td key={p.id} ta="center">
              <Checkbox
                mx="auto"
                w="fit-content"
                aria-label={`Assign ${item.name} to ${p.name}`}
                checked={checkedIds.includes(p.id)}
                onChange={e => handleCheck(p.id, e.currentTarget.checked)}
                color={p.color}
              />
            </Table.Td>
          ))}
          <Table.Td>
            {checkedIds.length > 0 && (
              <SplitTypeSelector
                persons={persons}
                checkedPersonIds={checkedIds}
                splits={splits}
                itemTotal={item.total_price}
                onChange={handleSplitsChange}
              />
            )}
          </Table.Td>
        </>
      )}
    </Table.Tr>
  )
}
