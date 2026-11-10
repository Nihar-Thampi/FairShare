import client from './client'
import type { Bill, BillItem, BillSummary, InvoiceFields } from '../types'

export const getBills = (signal?: AbortSignal) =>
  client.get<BillSummary[]>('/bills', { signal }).then(r => r.data)

/** Omit the name to let the first scan name the invoice after its vendor. */
export const createBill = (name?: string) =>
  client.post<Bill>('/bills', name ? { name } : {}).then(r => r.data)

export const getBill = (id: number, signal?: AbortSignal) =>
  client.get<Bill & { items: BillItem[] }>(`/bills/${id}`, { signal }).then(r => r.data)

export const updateBill = (id: number, data: InvoiceFields & Partial<Pick<Bill, 'status'>>) =>
  client.patch<Bill>(`/bills/${id}`, data).then(r => r.data)

export const deleteBill = (id: number) => client.delete(`/bills/${id}`)

export const clearItems = (id: number) => client.delete(`/bills/${id}/items`)

export const getBillImageBlobUrl = (billId: number, filename: string): Promise<string> =>
  client
    .get(`/bills/${billId}/images/${filename}`, { responseType: 'blob' })
    .then(r => URL.createObjectURL(r.data))

export const replaceBillImage = (billId: number, filename: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return client
    .put<Bill>(`/bills/${billId}/images/${filename}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data)
}

export const deleteBillImage = (billId: number, filename: string) =>
  client.delete<Bill>(`/bills/${billId}/images/${filename}`).then(r => r.data)
