import client from './client'
import type { BillItem } from '../types'

export const addItem = (billId: number, data: {
  name: string
  quantity: number
  unit_price: number
  is_tax_line: boolean
}) => client.post<BillItem>(`/bills/${billId}/items`, data).then(r => r.data)

export const updateItem = (itemId: number, data: Partial<{
  name: string
  quantity: number
  unit_price: number
  is_tax_line: boolean
}>) => client.patch<BillItem>(`/items/${itemId}`, data).then(r => r.data)

export const deleteItem = (itemId: number) => client.delete(`/items/${itemId}`)
