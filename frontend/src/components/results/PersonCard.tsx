import { Card, Text, Group, Avatar, Collapse, UnstyledButton, Stack, Divider } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { useState } from 'react'
import type { PersonResult } from '../../types'
import { useBillStore } from '../../store/billStore'
import { formatMoney } from '../../utils/invoice'

interface Props {
  result: PersonResult
}

export default function PersonCard({ result }: Props) {
  const currency = useBillStore(s => s.bill?.currency ?? null)
  const [expanded, setExpanded] = useState(false)
  const { person, subtotal, tax_share, total, breakdown } = result

  return (
    <Card withBorder radius="md" p="lg" style={{ borderTop: `4px solid ${person.color}` }}>
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Avatar radius="xl" size={36} styles={{ placeholder: { color: '#fff', background: person.color } }}>
            {person.name[0]?.toUpperCase()}
          </Avatar>
          <Text fw={600} lineClamp={1}>{person.name}</Text>
        </Group>
        <Text fw={700} fz={24}>{formatMoney(total, currency)}</Text>
      </Group>

      <Group gap="xl">
        <div>
          <Text size="xs" c="dimmed">Food</Text>
          <Text size="sm" fw={500}>{formatMoney(subtotal, currency)}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Tax/Fees</Text>
          <Text size="sm" fw={500}>{formatMoney(tax_share, currency)}</Text>
        </div>
      </Group>

      {breakdown.length > 0 && (
        <>
          <Divider my="xs" />
          <UnstyledButton
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
            w="100%"
          >
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={500}>Item breakdown ({breakdown.length})</Text>
              <IconChevronDown
                size={16}
                color="var(--mantine-color-gray-6)"
                style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }}
              />
            </Group>
          </UnstyledButton>

          <Collapse expanded={expanded}>
            <Stack gap={4} mt="xs">
              {breakdown.map((b, i) => (
                <Group key={i} justify="space-between">
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
                    {b.item_name}
                  </Text>
                  <Text size="xs">{formatMoney(b.amount, currency)}</Text>
                </Group>
              ))}
            </Stack>
          </Collapse>
        </>
      )}
    </Card>
  )
}
