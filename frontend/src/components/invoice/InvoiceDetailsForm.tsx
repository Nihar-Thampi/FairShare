import { useState } from 'react'
import { Autocomplete, Button, Group, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconDeviceFloppy } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { updateBill } from '../../api/bills'
import type { Bill, InvoiceFields } from '../../types'
import { CATEGORY_OPTIONS, CURRENCY_OPTIONS } from '../../utils/invoice'

type FormFields = Required<Pick<InvoiceFields,
  'vendor_name' | 'invoice_number' | 'invoice_date' | 'due_date' | 'currency' | 'category' | 'notes'
>>

const FIELDS: (keyof FormFields)[] = [
  'vendor_name', 'invoice_number', 'invoice_date', 'due_date', 'currency', 'category', 'notes',
]

const fromBill = (bill: Bill): Record<keyof FormFields, string> =>
  Object.fromEntries(FIELDS.map(f => [f, bill[f] ?? ''])) as Record<keyof FormFields, string>

interface Props {
  bill: Bill
  onSaved: (bill: Bill) => void
}

export default function InvoiceDetailsForm({ bill, onSaved }: Props) {
  // The parent keys this form by bill id + updated_at, so it remounts with fresh
  // values whenever the invoice changes on the server (e.g. after a scan).
  const [values, setValues] = useState(() => fromBill(bill))
  const [saving, setSaving] = useState(false)

  const saved = fromBill(bill)
  const dirty = FIELDS.some(f => values[f].trim() !== saved[f])
  const dueBeforeIssue = !!values.invoice_date && !!values.due_date && values.due_date < values.invoice_date

  const set = (field: keyof FormFields) => (value: string) => setValues(v => ({ ...v, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const changed = Object.fromEntries(
        FIELDS.filter(f => values[f].trim() !== saved[f]).map(f => [f, values[f].trim()]),
      )
      onSaved(await updateBill(bill.id, changed))
      notifications.show({ message: 'Invoice details saved', color: 'green' })
    } catch (e: unknown) {
      notifications.show({ message: e instanceof Error ? e.message : 'Failed to save invoice', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  const currencyOptions = values.currency && !CURRENCY_OPTIONS.includes(values.currency)
    ? [values.currency, ...CURRENCY_OPTIONS]
    : CURRENCY_OPTIONS

  return (
    <Stack>
      <div>
        <Text fw={600}>Invoice details</Text>
        <Text size="sm" c="dimmed">Filled in from the scan where possible. Check them before saving.</Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput label="Vendor" placeholder="Who issued the invoice"
          value={values.vendor_name} onChange={e => set('vendor_name')(e.currentTarget.value)} />
        <TextInput label="Invoice number" placeholder="e.g. INV-2026-0142"
          value={values.invoice_number} onChange={e => set('invoice_number')(e.currentTarget.value)} />
        <TextInput label="Invoice date" type="date"
          value={values.invoice_date} onChange={e => set('invoice_date')(e.currentTarget.value)} />
        <TextInput label="Due date" type="date"
          value={values.due_date} onChange={e => set('due_date')(e.currentTarget.value)}
          error={dueBeforeIssue ? 'Due date is before the invoice date' : undefined} />
        <Select label="Currency" placeholder="Select currency" data={currencyOptions} searchable clearable
          value={values.currency || null} onChange={v => set('currency')(v ?? '')} />
        <Autocomplete label="Category" placeholder="e.g. Office supplies" data={CATEGORY_OPTIONS}
          value={values.category} onChange={set('category')} />
      </SimpleGrid>

      <Textarea label="Notes" placeholder="Payment reference, purpose, approver…" autosize minRows={2} maxRows={6}
        value={values.notes} onChange={e => set('notes')(e.currentTarget.value)} />

      <Group justify="flex-end">
        <Button variant="default" disabled={!dirty || saving} onClick={() => setValues(saved)}>Discard</Button>
        <Button leftSection={<IconDeviceFloppy size={16} />} disabled={!dirty || dueBeforeIssue}
          loading={saving} onClick={handleSave}>
          Save details
        </Button>
      </Group>
    </Stack>
  )
}
