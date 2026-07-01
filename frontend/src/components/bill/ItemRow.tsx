import { useState } from 'react'
import { Table, TextInput, NumberInput, Checkbox, ActionIcon, Badge, Group, Text } from '@mantine/core'
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
    <Table.Tr style={{ background: item.is_tax_line ? 'var(--mantine-color-yellow-0)' : undefined }}>
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
      <Table.Td>
        ${(item.total_price ?? qty * price).toFixed(2)}
      </Table.Td>
      <Table.Td>
        <Checkbox
          checked={item.is_tax_line === 1}
          onChange={e => handleTaxToggle(e.currentTarget.checked)}
          size="sm"
        />
      </Table.Td>
      <Table.Td>
        <ActionIcon color="red" variant="subtle" size="sm" onClick={onDelete} aria-label="Delete item">
          ×
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  )
}
