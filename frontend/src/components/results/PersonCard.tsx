import { Card, Text, Group, Badge, Collapse, ActionIcon, Stack, Divider } from '@mantine/core'
import { useState } from 'react'
import type { PersonResult } from '../../types'

interface Props {
  result: PersonResult
}

export default function PersonCard({ result }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { person, subtotal, tax_share, total, breakdown } = result

  return (
    <Card withBorder shadow="sm" radius="md">
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Badge size="lg" style={{ background: person.color, color: '#fff' }}>
            {person.name}
          </Badge>
        </Group>
        <Text fw={700} size="xl">${total.toFixed(2)}</Text>
      </Group>

      <Group gap="xl">
        <div>
          <Text size="xs" c="dimmed">Food</Text>
          <Text size="sm" fw={500}>${subtotal.toFixed(2)}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Tax/Fees</Text>
          <Text size="sm" fw={500}>${tax_share.toFixed(2)}</Text>
        </div>
      </Group>

      {breakdown.length > 0 && (
        <>
          <Divider my="xs" />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Item breakdown</Text>
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▲' : '▼'}
            </ActionIcon>
          </Group>

          <Collapse expanded={expanded}>
            <Stack gap={4} mt="xs">
              {breakdown.map((b, i) => (
                <Group key={i} justify="space-between">
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
                    {b.item_name}
                  </Text>
                  <Text size="xs">${b.amount.toFixed(2)}</Text>
                </Group>
              ))}
            </Stack>
          </Collapse>
        </>
      )}
    </Card>
  )
}
