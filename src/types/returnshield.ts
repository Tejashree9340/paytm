export type CaseState =
  | 'IDLE'
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

export interface FormValues {
  order_number: string;
  product_name: string;
  purchase_date: string;
  delivery_date: string;
  original_amount_paid: string;
  requested_refund_amount: string;
  reason_for_return:
    | 'Damaged product'
    | 'Wrong item delivered'
    | 'Product not as described'
    | 'Changed my mind'
    | 'Other';
  reason_details: string;
  claimed_return_window_days: string;
  claimed_policy_description: string;
  product_condition: string;
  evidence_availability: 'Available' | 'Not available' | 'Not required by policy';
  uploaded_evidence?: {
    fileName: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
    sizeBytes: number;
  };
  idempotency_key?: string;
  fault_simulation:
    | 'none'
    | 'transient_read_failure'
    | 'lookup_timeout'
    | 'malformed_tool_output'
    | 'malformed_model_output'
    | 'refund_uncertain_timeout';
}

export interface OrderRecord {
  order_id: string;
  customer_alias: string;
  product_name: string;
  product_type: string;
  purchase_date: string;
  delivery_date: string;
  amount: number;
  currency: string;
  status: string;
  notes?: string;
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
  stage: string;
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
    policy?: {
      product_type: string;
      return_window_days: number;
      policy_summary: string;
    };
    refundHistory: Array<{
      refund_id: string;
      amount: number;
      currency: string;
      timestamp: string;
      status: string;
    }>;
    discrepancies: DiscrepancyItem[];
    summary: string;
    modelUsed: string;
  };
  agent2Evaluation?: {
    aiRecommendation: PolicyDecision;
    aiReasoning: string;
    promptInjectionFlagged: boolean;
    gateResult: {
      decision: PolicyDecision;
      plainTitle: string;
      plainReason: string;
      technicalReason: string;
      checks: PolicyCheckItem[];
      discrepancies: DiscrepancyItem[];
      remainingRefundable: number;
    };
  };
  toolCalls: ToolCallTrace[];
  auditTrail: AuditLogEntry[];
  canReconcile?: boolean;
}

export interface AutomatedTestCaseResult {
  id: number;
  category: string;
  name: string;
  inputSummary: string;
  expected: string;
  actual: string;
  passed: boolean;
  refundAttempted: boolean;
  refundAuthorized: boolean;
  eventOrError: string;
}

export interface TestLabReport {
  executedAt: string;
  disclaimer: string;
  summary: {
    totalExecuted: number;
    passed: number;
    failed: number;
    passRate: string;
    unsafeActionsBlocked: number;
    legitimateIncorrectlyBlocked: number;
    toolFailuresInjected: number;
    recoveriesSucceeded: number;
    confirmedSimulatedInrRefunded: number;
  };
  tests: AutomatedTestCaseResult[];
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateDDMMYYYY(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export const INITIAL_FORM_VALUES: FormValues = {
  order_number: '',
  product_name: '',
  purchase_date: '',
  delivery_date: '',
  original_amount_paid: '',
  requested_refund_amount: '',
  reason_for_return: 'Damaged product',
  reason_details: '',
  claimed_return_window_days: '7',
  claimed_policy_description: 'Return within 7 days of delivery',
  product_condition: 'Unused, with original packaging',
  evidence_availability: 'Available',
  uploaded_evidence: undefined,
  idempotency_key: '',
  fault_simulation: 'none',
};
