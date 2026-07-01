import { create } from 'zustand'
import type { Bill, BillItem, Person, Assignment, PersonResult } from '../types'

interface BillStore {
  bill: Bill | null
  items: BillItem[]
  persons: Person[]
  assignments: Assignment[]
  results: PersonResult[]

  setBill: (bill: Bill) => void
  setItems: (items: BillItem[]) => void
  setPersons: (persons: Person[]) => void
  setAssignments: (assignments: Assignment[]) => void
  updateItemAssignments: (itemId: number, saved: Assignment[]) => void
  setResults: (results: PersonResult[]) => void
  reset: () => void
}

export const useBillStore = create<BillStore>((set) => ({
  bill: null,
  items: [],
  persons: [],
  assignments: [],
  results: [],

  setBill: (bill) => set({ bill }),
  setItems: (items) => set({ items }),
  setPersons: (persons) => set({ persons }),
  setAssignments: (assignments) => set({ assignments }),
  updateItemAssignments: (itemId, saved) =>
    set(state => ({ assignments: [...state.assignments.filter(a => a.item_id !== itemId), ...saved] })),
  setResults: (results) => set({ results }),
  reset: () => set({ bill: null, items: [], persons: [], assignments: [], results: [] }),
}))
