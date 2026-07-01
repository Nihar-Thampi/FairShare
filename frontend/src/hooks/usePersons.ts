import { useState, useCallback } from 'react'
import { getPersons, addPerson, deletePerson } from '../api/persons'
import { useBillStore } from '../store/billStore'

const PERSON_COLORS = [
  '#e03131', '#2f9e44', '#1971c2', '#e67700', '#7048e8',
  '#c2255c', '#0c8599', '#5c7cfa', '#f76707', '#37b24d',
]

export function usePersons() {
  const { persons, setPersons } = useBillStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPersons = useCallback(async (billId: number, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getPersons(billId, signal)
      setPersons(data)
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'canceled') return
      setError(e instanceof Error ? e.message : 'Failed to load persons')
    } finally {
      setLoading(false)
    }
  }, [setPersons])

  const addPersonToBill = useCallback(async (billId: number, name: string) => {
    const nextColor = PERSON_COLORS[persons.length % PERSON_COLORS.length]
    const person = await addPerson(billId, { name, color: nextColor })
    setPersons([...persons, person])
    return person
  }, [persons, setPersons])

  const removePersonFromBill = useCallback(async (personId: number) => {
    await deletePerson(personId)
    setPersons(persons.filter(p => p.id !== personId))
  }, [persons, setPersons])

  return { persons, loading, error, fetchPersons, addPersonToBill, removePersonFromBill }
}
