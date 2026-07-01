import { useState, useCallback } from 'react'
import { runCalculate, getResults } from '../api/calculate'
import { useBillStore } from '../store/billStore'

export function useCalculation() {
  const { setResults } = useBillStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calculate = useCallback(async (billId: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await runCalculate(billId)
      setResults(data.results)
      return data.results
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Calculation failed'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [setResults])

  const fetchResults = useCallback(async (billId: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getResults(billId)
      setResults(data.results)
      return data.results
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load results')
      return null
    } finally {
      setLoading(false)
    }
  }, [setResults])

  return { loading, error, calculate, fetchResults }
}
