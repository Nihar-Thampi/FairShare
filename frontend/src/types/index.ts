export type BillStatus = 'draft' | 'ocr_pending' | 'ocr_done' | 'assigned' | 'calculated'
export type SplitType = 'equal' | 'percentage' | 'custom'

export interface Bill {
  id: number
  name: string
  image_path: string | null
  raw_ocr: string | null
  llm_output: string | null
  status: BillStatus
  created_at: string
  updated_at: string
  items?: BillItem[]
}

export interface BillItem {
  id: number
  bill_id: number
  name: string
  quantity: number
  unit_price: number
  total_price: number
  is_tax_line: number  // SQLite stores as 0/1
  sort_order: number
  created_at: string
}

export interface Person {
  id: number
  bill_id: number
  name: string
  color: string
  created_at: string
}

export interface Assignment {
  id: number
  item_id: number
  person_id: number
  split_type: SplitType
  split_value: number | null
  created_at: string
}

export interface BreakdownEntry {
  item_id: number
  item_name: string
  amount: number
}

export interface PersonResult {
  person: Person
  subtotal: number
  tax_share: number
  total: number
  breakdown: BreakdownEntry[]
  calculated_at?: string
}

export interface CalculationResponse {
  results: PersonResult[]
  calculated_at: string | null
}

export interface OcrUploadResponse {
  bill_id: number
  business_name: string | null
  items: BillItem[]
  raw_ocr: string
  processing_time_ms?: number
}

export interface LLMHealthResponse {
  status: 'ok' | 'unreachable'
  models: string[]
  error?: string
}

export interface User {
  id: number
  email: string
  name: string
  created_at: string
}

export interface AuthResponse {
  user: User
  access_token: string
  refresh_token: string
}
