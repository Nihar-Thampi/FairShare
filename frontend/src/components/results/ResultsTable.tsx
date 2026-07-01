import { Stack, Text, SimpleGrid, Alert, Loader, Center, Button } from '@mantine/core'
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
        <Alert color="red" title="Calculation error">
          {error}
        </Alert>
      )}

      <Button
        onClick={() => {
          onCalculate()
        }}
        size="md"
        w="fit-content"
      >
        Calculate Split
      </Button>

      {results.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {results.map(r => (
              <PersonCard key={r.person.id} result={r} />
            ))}
          </SimpleGrid>

          <Text size="sm" c="dimmed" ta="right">
            Grand total: <strong>${grandTotal.toFixed(2)}</strong>
          </Text>
        </>
      )}

      {results.length === 0 && !error && (
        <Text c="dimmed" ta="center" py="md">
          Press "Calculate Split" to see each person's share.
        </Text>
      )}
    </Stack>
  )
}
