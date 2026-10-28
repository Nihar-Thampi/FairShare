import { Stack, Text, SimpleGrid, Alert, Loader, Center, Button, Group, Paper, ThemeIcon } from '@mantine/core'
import { IconAlertCircle, IconCalculator } from '@tabler/icons-react'
import type { PersonResult } from '../../types'
import PersonCard from './PersonCard'

interface Props {
  billId: number
  results: PersonResult[]
  loading: boolean
  error: string | null
  onCalculate: () => void
}

export default function ResultsTable({ results, loading, error, onCalculate }: Props) {
  if (loading) {
    return <Center py="xl"><Loader /></Center>
  }

  const grandTotal = results.reduce((acc, r) => acc + r.total, 0)

  return (
    <Stack>
      {error && (
        <Alert color="red" variant="light" title="Calculation error" icon={<IconAlertCircle size={18} />}>
          {error}
        </Alert>
      )}

      <Group justify="space-between" align="center">
        <div>
          <Text fw={600}>Results</Text>
          <Text size="sm" c="dimmed">See how much each person owes.</Text>
        </div>
        <Button
          onClick={() => {
            onCalculate()
          }}
          size="md"
          leftSection={<IconCalculator size={18} />}
        >
          Calculate Split
        </Button>
      </Group>

      {results.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {results.map(r => (
              <PersonCard key={r.person.id} result={r} />
            ))}
          </SimpleGrid>

          <Paper bg="teal.0" p="md" radius="md">
            <Group justify="space-between">
              <Text size="sm" fw={500} c="teal.9">Grand total</Text>
              <Text size="xl" fw={700} c="teal.9">${grandTotal.toFixed(2)}</Text>
            </Group>
          </Paper>
        </>
      )}

      {results.length === 0 && !error && (
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={56} radius="xl" variant="light" color="gray">
            <IconCalculator size={28} />
          </ThemeIcon>
          <Text c="dimmed" ta="center">
            Press "Calculate Split" to see each person's share.
          </Text>
        </Stack>
      )}
    </Stack>
  )
}
