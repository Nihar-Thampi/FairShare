import { useState } from 'react'
import { Stack, Button, Text, Table, ScrollArea, ThemeIcon } from '@mantine/core'
import { IconListDetails, IconPlus } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { addItem, updateItem, deleteItem } from '../../api/items'
import type { BillItem } from '../../types'
import ItemRow from './ItemRow'

interface Props {
  billId: number
  items: BillItem[]
  onChange: (items: BillItem[]) => void
}

export default function ItemList({ billId, items, onChange }: Props) {
  const [adding, setAdding] = useState(false)

  // Non-tax items first (preserving sort_order), then tax lines
  const regularItems = items.filter(i => i.is_tax_line !== 1)
  const taxItems = items.filter(i => i.is_tax_line === 1)
  const sortedItems = [...regularItems, ...taxItems]

  const handleUpdate = async (itemId: number, data: Partial<BillItem>) => {
    try {
      const updated = await updateItem(itemId, {
        name: data.name,
        quantity: data.quantity,
        unit_price: data.unit_price,
        is_tax_line: data.is_tax_line === 1,
      })
      onChange(items.map(i => i.id === itemId ? updated : i))
    } catch (e: unknown) {
      notifications.show({ message: e instanceof Error ? e.message : 'Update failed', color: 'red' })
    }
  }

  const handleDelete = async (itemId: number) => {
    try {
      await deleteItem(itemId)
      onChange(items.filter(i => i.id !== itemId))
    } catch {
      notifications.show({ message: 'Failed to delete item', color: 'red' })
    }
  }

  const handleAddItem = async () => {
    setAdding(true)
    try {
      const created = await addItem(billId, {
        name: 'New item',
        quantity: 1,
        unit_price: 0,
        is_tax_line: false,
      })
      onChange([...items, created])
    } catch {
      notifications.show({ message: 'Failed to add item', color: 'red' })
    } finally {
      setAdding(false)
    }
  }

  if (items.length === 0) {
    return (
      <Stack align="center" gap="sm" py="xl">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          <IconListDetails size={28} />
        </ThemeIcon>
        <Text c="dimmed" ta="center">No items yet. Upload a receipt or add items manually.</Text>
        <Button variant="default" leftSection={<IconPlus size={16} />} onClick={handleAddItem} loading={adding}>Add Item</Button>
      </Stack>
    )
  }

  return (
    <Stack>
      <div>
        <Text fw={600}>Review items</Text>
        <Text size="sm" c="dimmed">Click any cell to edit. Mark taxes, tips and fees as tax lines.</Text>
      </div>

      <ScrollArea>
        <Table className="fs-table" highlightOnHover withTableBorder verticalSpacing="xs" miw={620}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>#</Table.Th>
            <Table.Th>Item</Table.Th>
            <Table.Th w={80}>Qty</Table.Th>
            <Table.Th w={100}>Unit Price</Table.Th>
            <Table.Th w={100} ta="right">Total</Table.Th>
            <Table.Th w={80} ta="center">Tax?</Table.Th>
            <Table.Th w={60}></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedItems.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              number={idx + 1}
              onUpdate={(data) => handleUpdate(item.id, data)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </Table.Tbody>
        </Table>
      </ScrollArea>

      <Button variant="light" leftSection={<IconPlus size={16} />} onClick={handleAddItem} loading={adding} w="fit-content">
        Add Item Manually
      </Button>
    </Stack>
  )
}
