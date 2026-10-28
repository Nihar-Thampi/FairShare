import { useState } from 'react'
import { Table, TextInput, NumberInput, Checkbox, ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import type { BillItem } from '../../types'

interface Props {
  item: BillItem
  number: number
  onUpdate: (data: Partial<BillItem>) => void
  onDelete: () => void
}

export default function ItemRow({ item, number, onUpdate, onDelete }: Props) {
  const [name, setName] = useState(item.name)
  const [qty, setQty] = useState(item.quantity)
  const [price, setPrice] = useState(item.unit_price)

  const handleBlurName = () => {
    if (name.trim() !== item.name) onUpdate({ name: name.trim() || item.name })
  }

  const handleBlurQty = () => {
    if (qty !== item.quantity) onUpdate({ quantity: qty, unit_price: price })
  }

  const handleBlurPrice = () => {
    if (price !== item.unit_price) onUpdate({ quantity: qty, unit_price: price })
  }

  const handleTaxToggle = (checked: boolean) => {
    onUpdate({ is_tax_line: checked ? 1 : 0 })
  }

  return (
    <Table.Tr className={item.is_tax_line ? 'fs-tax-row' : undefined}>
      <Table.Td>
        <Text size="xs" c="dimmed" ta="center">{number}</Text>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          {item.is_tax_line === 1 && <Badge color="yellow" size="xs">TAX</Badge>}
          <TextInput
            value={name}
            onChange={e => setName(e.currentTarget.value)}
            onBlur={handleBlurName}
            size="xs"
            variant="unstyled"
            style={{ flex: 1, minWidth: 120 }}
          />
        </Group>
      </Table.Td>
      <Table.Td>
        <NumberInput
          value={qty}
          onChange={v => setQty(Number(v))}
          onBlur={handleBlurQty}
          size="xs"
          variant="unstyled"
          min={0}
          decimalScale={2}
          hideControls
        />
      </Table.Td>
      <Table.Td>
        <NumberInput
          value={price}
          onChange={v => setPrice(Number(v))}
          onBlur={handleBlurPrice}
          size="xs"
          variant="unstyled"
          min={0}
          decimalScale={2}
          prefix="$"
          hideControls
        />
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" fw={500}>${(item.total_price ?? qty * price).toFixed(2)}</Text>
      </Table.Td>
      <Table.Td>
        <Checkbox
          mx="auto"
          w="fit-content"
          aria-label="Tax line"
          checked={item.is_tax_line === 1}
          onChange={e => handleTaxToggle(e.currentTarget.checked)}
          size="sm"
        />
      </Table.Td>
      <Table.Td>
        <Tooltip label="Delete item" withArrow>
          <ActionIcon color="gray" variant="subtle" onClick={onDelete} aria-label="Delete item">
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  )
}
