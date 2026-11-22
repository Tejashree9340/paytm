import { z } from 'zod';

export type CaseState =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'INVESTIGATING'
  | 'BLOCKED'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_ACTION'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN_OUTCOME';

export type PolicyDecision = 'ALLOW' | 'BLOCK' | 'NEEDS_REVIEW';

export const ReturnReasonEnum = z.enum([
  'Damaged product',
  'Wrong item delivered',
  'Product not as described',
  'Changed my mind',
  'Other',
]);

export const EvidenceAvailabilityEnum = z.enum([
  'Available',
  'Not available',
  'Not required by policy',
]);

export const UploadedEvidenceSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024),
}).optional();

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(dateStr: string): boolean {
  if (!isoDateRegex.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export const ReturnRequestFormSchema = z.object({
  order_number: z
    .string()
    .trim()
    .min(3, 'Order number is required.')
    .max(32, 'Order number is too long.')
    .regex(/^[A-Za-z0-9-]+$/, 'Order number may only contain letters, numbers, and hyphens.'),
  product_name: z
    .string()
    .trim()
    .min(2, 'Product name is required.')
    .max(150, 'Product name is too long.'),
  purchase_date: z
    .string()
    .trim()
    .refine(isValidIsoDate, 'Purchase date must be a valid calendar date.'),
  delivery_date: z
    .string()
    .trim()
    .refine(isValidIsoDate, 'Delivery date must be a valid calendar date.'),
  original_amount_paid: z
    .number()
    .finite('Original amount paid must be a valid number.')
    .positive('Original amount paid must be greater than ₹0.00.')
    .max(10000000, 'Original amount exceeds supported demo ceiling.'),
  requested_refund_amount: z
    .number()
    .finite('Requested refund amount must be a valid number.')
    .positive('Requested refund amount must be greater than ₹0.00.')
    .max(10000000, 'Requested refund exceeds supported demo ceiling.'),
  currency: z.string().trim().toUpperCase().default('INR'),
  reason_for_return: ReturnReasonEnum,
  reason_details: z.string().trim().max(1500, 'Reason details must be under 1,500 characters.').optional().default(''),
  claimed_return_window_days: z
    .number()
    .int('Return window must be a whole number of days.')
    .positive('Return window must be at least 1 day.')
    .max(365, 'Return window cannot exceed 365 days.'),
  claimed_policy_description: z
    .string()
    .trim()
    .min(5, 'Return policy description is required.')
    .max(500, 'Policy description must be under 500 characters.'),
  product_condition: z
    .string()
    .trim()
    .min(3, 'Product condition and return requirements are required.')
    .max(400, 'Product condition text is too long.'),
  evidence_availability: EvidenceAvailabilityEnum,
  uploaded_evidence: UploadedEvidenceSchema,
  idempotency_key: z.string().trim().min(6).max(120).optional(),
  fault_simulation: z
    .enum(['none', 'transient_read_failure', 'lookup_timeout', 'malformed_tool_output', 'malformed_model_output', 'refund_uncertain_timeout'])
    .optional()
    .default('none'),
});

export type ReturnRequestForm = z.infer<typeof ReturnRequestFormSchema>;

export const OrderSchema = z.object({
  order_id: z.string().min(3),
  customer_alias: z.string().min(1),
  product_name: z.string().min(1),
  product_type: z.string().min(1),
  purchase_date: z.string().refine(isValidIsoDate),
  delivery_date: z.string().refine(isValidIsoDate),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  status: z.enum(['delivered', 'shipped', 'cancelled', 'refunded', 'partially_refunded']),
  notes: z.string().optional(),
});

export type OrderRecord = z.infer<typeof OrderSchema>;

export const ReturnPolicySchema = z.object({
  product_type: z.string().min(1),
  return_window_days: z.number().int().nonnegative(),
  max_refund_percentage: z.number().positive().max(100),
  requires_unused_packaging: z.boolean(),
  requires_evidence_for_damage: z.boolean(),
  allow_changed_mind: z.boolean(),
  policy_summary: z.string().min(1),
});

export type ReturnPolicyRecord = z.infer<typeof ReturnPolicySchema>;

export const RefundRecordSchema = z.object({
  refund_id: z.string(),
  order_id: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  timestamp: z.string(),
  idempotency_key: z.string(),
  status: z.enum(['SUCCEEDED', 'FAILED', 'PENDING', 'UNKNOWN_OUTCOME']),
});

export type RefundRecord = z.infer<typeof RefundRecordSchema>;

export interface TransactionRecord {
  idempotency_key: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN_OUTCOME';
  refund_id?: string;
  created_at: string;
  updated_at: string;
  note: string;
}

export interface ToolCallTrace {
  id: string;
  agent: 'Order Investigator' | 'Safety & Policy Checker' | 'Resolution Agent';
  tool: string;
  inputSummary: string;
  outputSummary: string;
  status: 'RUNNING' | 'COMPLETED' | 'RETRYING' | 'FAILED' | 'BLOCKED' | 'UNKNOWN_OUTCOME';
  attempt: number;
  timestamp: string;
  rawDetails?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  case_id: string;
  timestamp: string;
  stage: CaseState | 'TOOL_CALL' | 'POLICY_GATE' | 'SECURITY_ALERT' | 'RECONCILIATION';
  actor: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PolicyCheckItem {
  rule: string;
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'WARN';
  plainMessage: string;
}

export interface DiscrepancyItem {
  field: string;
  customerClaim: string;
  trustedRecord: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface PolicyGateResult {
  decision: PolicyDecision;
  plainTitle: string;
  plainReason: string;
  technicalReason: string;
  checks: PolicyCheckItem[];
  discrepancies: DiscrepancyItem[];
  promptInjectionDetected: boolean;
  remainingRefundable: number;
  evidence: Record<string, unknown>;
  authorizationToken?: string;
}

export interface CaseInvestigationResponse {
  case_id: string;
  state: CaseState;
  decision: PolicyDecision;
  plainTitle: string;
  plainReason: string;
  furtherActionNeeded: string;
  requestedAmount: number;
  refundedAmount: number;
  currency: string;
  transactionStatus: 'NOT_ATTEMPTED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN_OUTCOME';
  refundId?: string;
  idempotencyKey: string;
  supportReply: string;
  agent1Findings?: {
    orderFound: boolean;
    order?: OrderRecord;
    policyFound: boolean;
    policy?: ReturnPolicyRecord;
    refundHistory: RefundRecord[];
    discrepancies: DiscrepancyItem[];
    summary: string;
    modelUsed: string;
  };
  agent2Evaluation?: {
    aiRecommendation: PolicyDecision;
    aiReasoning: string;
    promptInjectionFlagged: boolean;
    gateResult: PolicyGateResult;
  };
  toolCalls: ToolCallTrace[];
  auditTrail: AuditLogEntry[];
  canReconcile?: boolean;
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateDDMMYYYY(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
