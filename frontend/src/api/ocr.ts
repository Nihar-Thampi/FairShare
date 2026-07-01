import client from './client'
import type { OcrUploadResponse } from '../types'

export const uploadReceipt = (billId: number, files: File | File[]) => {
  const form = new FormData()
  form.append('bill_id', String(billId))
  const fileList = Array.isArray(files) ? files : [files]
  fileList.forEach(f => form.append('file', f))
  return client
    .post<OcrUploadResponse>('/ocr/upload', form, {
      timeout: 180_000,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data)
}
