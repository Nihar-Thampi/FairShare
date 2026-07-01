import client from './client'
import type { Person } from '../types'

export const getPersons = (billId: number, signal?: AbortSignal) =>
  client.get<Person[]>(`/bills/${billId}/persons`, { signal }).then(r => r.data)

export const addPerson = (billId: number, data: { name: string; color: string }) =>
  client.post<Person>(`/bills/${billId}/persons`, data).then(r => r.data)

export const deletePerson = (personId: number) =>
  client.delete(`/persons/${personId}`)
