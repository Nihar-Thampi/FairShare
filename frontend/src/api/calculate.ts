import client from './client'
import type { CalculationResponse, LLMHealthResponse } from '../types'

export const runCalculate = (billId: number) =>
  client.post<CalculationResponse>(`/bills/${billId}/calculate`).then(r => r.data)

export const getResults = (billId: number) =>
  client.get<CalculationResponse>(`/bills/${billId}/results`).then(r => r.data)

export const getLLMHealth = (signal?: AbortSignal) =>
  client.get<LLMHealthResponse>('/health/llm', { signal }).then(r => r.data)
