import { SegmentedControl, Group, NumberInput, Text, Badge } from '@mantine/core'
import type { SplitType, Person } from '../../types'
import { useBillStore } from '../../store/billStore'
import { currencySymbol, formatMoney } from '../../utils/invoice'

export interface PersonSplit {
  person_id: number
  split_type: SplitType
  split_value: number | null
}

interface Props {
  persons: Person[]
  checkedPersonIds: number[]
  splits: PersonSplit[]
  itemTotal: number
  onChange: (splits: PersonSplit[]) => void
}

export default function SplitTypeSelector({ persons, checkedPersonIds, splits, itemTotal, onChange }: Props) {
  const currency = useBillStore(s => s.bill?.currency ?? null)
  const currentType = splits[0]?.split_type ?? 'equal'

  const assignedPersons = persons.filter(p => checkedPersonIds.includes(p.id))

  const handleTypeChange = (type: SplitType) => {
    const newSplits: PersonSplit[] = assignedPersons.map(p => ({
      person_id: p.id,
      split_type: type,
      split_value: type === 'equal' ? null
        : type === 'percentage' ? parseFloat((100 / assignedPersons.length).toFixed(2))
        : parseFloat((itemTotal / assignedPersons.length).toFixed(2)),
    }))
    onChange(newSplits)
  }

  const handleValueChange = (personId: number, value: number) => {
    onChange(splits.map(s =>
      s.person_id === personId ? { ...s, split_value: value } : s
    ))
  }

  if (assignedPersons.length === 0) return null

  const totalPct = splits.reduce((acc, s) => acc + (s.split_value ?? 0), 0)
  const totalCustom = splits.reduce((acc, s) => acc + (s.split_value ?? 0), 0)
  const pctValid = Math.abs(totalPct - 100) <= 0.01
  const customValid = Math.abs(totalCustom - itemTotal) <= 0.01

  return (
    <div>
      <SegmentedControl
        size="xs"
        value={currentType}
        onChange={v => handleTypeChange(v as SplitType)}
        data={[
          { value: 'equal', label: 'Equal' },
          { value: 'percentage', label: '%' },
          { value: 'custom', label: 'Custom' },
        ]}
        mb="xs"
      />

      {currentType !== 'equal' && (
        <div>
          {assignedPersons.map(p => {
            const split = splits.find(s => s.person_id === p.id)
            return (
              <Group key={p.id} gap="xs" mb={4}>
                <Badge size="sm" tt="none" style={{ background: p.color, color: '#fff', minWidth: 80 }}>
                  {p.name}
                </Badge>
                <NumberInput
                  size="xs"
                  value={split?.split_value ?? 0}
                  onChange={v => handleValueChange(p.id, Number(v))}
                  prefix={currentType === 'custom' ? currencySymbol(currency) : undefined}
                  suffix={currentType === 'percentage' ? '%' : undefined}
                  min={0}
                  decimalScale={2}
                  hideControls
                  w={90}
                />
              </Group>
            )
          })}
          <Text size="xs" c={currentType === 'percentage' ? (pctValid ? 'green' : 'red') : (customValid ? 'green' : 'red')} mt={4}>
            {currentType === 'percentage'
              ? `Total: ${totalPct.toFixed(2)}% ${pctValid ? '✓' : '(must equal 100%)'}`
              : `Total: ${formatMoney(totalCustom, currency)} ${customValid ? '✓' : `(must equal ${formatMoney(itemTotal, currency)})`}`
            }
          </Text>
        </div>
      )}
    </div>
  )
}
