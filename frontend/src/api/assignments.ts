import client from './client'
import type { Assignment, SplitType } from '../types'

export const getAssignments = (billId: number) =>
  client.get<Assignment[]>(`/bills/${billId}/assignments`).then(r => r.data)

export const replaceAssignments = (
  itemId: number,
  assignments: { person_id: number; split_type: SplitType; split_value?: number | null }[]
) =>
  client.put<Assignment[]>(`/items/${itemId}/assignments`, { assignments }).then(r => r.data)

export const clearAssignments = (itemId: number) =>
  client.delete(`/items/${itemId}/assignments`)

export const bulkAssignPerson = (billId: number, personId: number) =>
  client.put<Assignment[]>(`/bills/${billId}/assignments/person/${personId}`).then(r => r.data)

export const bulkRemovePerson = (billId: number, personId: number) =>
  client.delete<Assignment[]>(`/bills/${billId}/assignments/person/${personId}`).then(r => r.data)
