export type BillStatus = 'draft' | 'ocr_pending' | 'ocr_done' | 'assigned' | 'calculated'
export type SplitType = 'equal' | 'percentage' | 'custom'
export type PaymentStatus = 'unpaid' | 'paid'

/** An invoice. Stored in the `bills` table, so the API and store keep the "bill" name. */
export interface Bill {
  id: number
  name: string
  image_path: string | null
  raw_ocr: string | null
  llm_output: string | null
  status: BillStatus
  created_at: string
  updated_at: string
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null   // YYYY-MM-DD
  due_date: string | null       // YYYY-MM-DD
  currency: string | null       // ISO 4217
  category: string | null
  notes: string | null
  extracted_total: number | null
  payment_status: PaymentStatus
  paid_at: string | null        // YYYY-MM-DD
  items?: BillItem[]
}

/** A row from GET /bills, which adds totals computed from the line items. */
export interface BillSummary extends Bill {
  total: number
  tax_total: number
  item_count: number
}

export type InvoiceFields = Partial<Pick<Bill,
  'name' | 'vendor_name' | 'invoice_number' | 'invoice_date' | 'due_date' |
  'currency' | 'category' | 'notes' | 'payment_status' | 'paid_at'
>>

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
  bill: Bill
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
