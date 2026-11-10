import { Alert, Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react'
import type { BillItem } from '../../types'
import { formatMoney, totalMismatch } from '../../utils/invoice'

interface Props {
  items: BillItem[]
  currency: string | null
  extractedTotal: number | null
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Group justify="space-between">
      <Text size="sm" c={strong ? undefined : 'dimmed'} fw={strong ? 600 : 400}>{label}</Text>
      <Text className="fs-amount" fz={strong ? 22 : 'sm'} fw={strong ? 600 : 500}>{value}</Text>
    </Group>
  )
}

/** Totals computed from the line items, checked against the total printed on the invoice. */
export default function InvoiceTotals({ items, currency, extractedTotal }: Props) {
  const tax = items.filter(i => i.is_tax_line === 1).reduce((s, i) => s + i.total_price, 0)
  const total = items.reduce((s, i) => s + i.total_price, 0)
  const mismatch = totalMismatch(extractedTotal, total)

  return (
    <Stack gap="lg" maw={420} ml="auto" w="100%">
      {/* The bottom of a till slip: dashed rule above the total, torn edge below. */}
      <div className="fs-receipt">
        <Stack gap={8}>
          <Row label="Subtotal" value={formatMoney(total - tax, currency)} />
          <Row label="Tax" value={formatMoney(tax, currency)} />
          <div className="fs-receipt-rule" />
          <Row label="Total" value={formatMoney(total, currency)} strong />
        </Stack>
      </div>

      {mismatch === 0 && (
        <Alert color="green" variant="light" icon={<IconCircleCheck size={18} />} p="xs">
          <Text size="sm">Line items add up to the total printed on the invoice.</Text>
        </Alert>
      )}
      {mismatch != null && mismatch !== 0 && extractedTotal != null && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} p="xs">
          <Text size="sm">
            The invoice shows a total of <strong>{formatMoney(extractedTotal, currency)}</strong>, but
            the line items add up to {formatMoney(total, currency)} ({mismatch > 0 ? '+' : ''}
            {formatMoney(mismatch, currency)}). Check for a missed or misread line.
          </Text>
        </Alert>
      )}
    </Stack>
  )
}
