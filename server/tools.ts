import { z } from 'zod';
import {
  OrderSchema,
  RefundRecordSchema,
  ReturnPolicySchema,
  formatINR,
  type OrderRecord,
  type RefundRecord,
  type ReturnPolicyRecord,
  type TransactionRecord,
} from './types.ts';
import { saveStore, type DemoStore } from './store.ts';

export interface ToolSimulationOptions {
  simulateTransientReadFailures?: number;
  simulateLookupTimeout?: boolean;
  simulateMalformedToolOutput?: boolean;
  simulateRefundUncertainTimeout?: boolean;
  timeoutMs?: number;
}

export class ToolTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolTimeoutError';
  }
}

export class MalformedToolOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedToolOutputError';
  }
}

export const ALLOWED_TOOLS = [
  'lookup_order',
  'get_return_policy',
  'get_refund_history',
  'check_transaction_status',
  'execute_simulated_refund',
  'create_support_reply',
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOLS)[number];

export function isRegisteredTool(name: string): name is AllowedToolName {
  return (ALLOWED_TOOLS as readonly string[]).includes(name);
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs = 1200): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ToolTimeoutError(`Tool timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withSafeReadRetry<T>(
  operationName: string,
  fn: (attempt: number) => Promise<T>,
  maxRetries = 2,
  onRetry?: (attempt: number, errorMessage: string) => void
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        err instanceof ToolTimeoutError ||
        (err?.message && err.message.toLowerCase().includes('transient'));
      if (!isRetryable || attempt > maxRetries) {
        throw lastError;
      }
      if (onRetry) {
        onRetry(attempt, `${operationName} temporary failure: ${lastError.message}`);
      }
      await new Promise((r) => setTimeout(r, 60 * attempt));
    }
  }
  throw lastError || new Error(`${operationName} failed.`);
}

const OrderIdInputSchema = z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9-]+$/);
const ProductTypeInputSchema = z.string().trim().min(2).max(64);
const IdempotencyInputSchema = z.string().trim().min(6).max(120);

export async function lookup_order(
  order_id: string,
  store: DemoStore,
  options: ToolSimulationOptions = {},
  attemptState?: { count: number }
): Promise<{ ok: true; order: OrderRecord } | { ok: false; error: string }> {
  const parsedId = OrderIdInputSchema.safeParse(order_id);
  if (!parsedId.success) {
    return { ok: false, error: 'Order number format is invalid.' };
  }

  return withTimeout(async () => {
    if (options.simulateLookupTimeout) {
      await new Promise((r) => setTimeout(r, (options.timeoutMs ?? 250) + 120));
    }
    if (options.simulateTransientReadFailures && attemptState) {
      attemptState.count += 1;
      if (attemptState.count <= options.simulateTransientReadFailures) {
        throw new Error('Transient order database read error');
      }
    }

    const cleanId = parsedId.data.toUpperCase();
    const rawOrder: unknown = options.simulateMalformedToolOutput
      ? { order_id: null, amount: 'not-a-number' }
      : store.orders[cleanId];

    if (!rawOrder) {
      return { ok: false, error: `We couldn't find order ${cleanId}.` };
    }

    const validated = OrderSchema.safeParse(rawOrder);
    if (!validated.success) {
      throw new MalformedToolOutputError('Order lookup returned invalid or incomplete order data.');
    }

    return { ok: true, order: validated.data };
  }, options.timeoutMs ?? 1200);
}

export async function get_return_policy(
  product_type: string,
  store: DemoStore,
  options: ToolSimulationOptions = {}
): Promise<{ ok: true; policy: ReturnPolicyRecord } | { ok: false; error: string }> {
  const parsedType = ProductTypeInputSchema.safeParse(product_type);
  if (!parsedType.success) {
    return { ok: false, error: 'Product category is invalid or missing.' };
  }

  return withTimeout(async () => {
    const key = parsedType.data.toLowerCase();
    const rawPolicy = store.policies[key];
    if (!rawPolicy) {
      return {
        ok: false,
        error: `No verified store return policy was found for product category "${key}".`,
      };
    }

    const validated = ReturnPolicySchema.safeParse(rawPolicy);
    if (!validated.success) {
      throw new MalformedToolOutputError('Policy lookup returned malformed policy rules.');
    }

    return { ok: true, policy: validated.data };
  }, options.timeoutMs ?? 1200);
}

export async function get_refund_history(
  order_id: string,
  store: DemoStore,
  options: ToolSimulationOptions = {}
): Promise<{ ok: true; history: RefundRecord[] } | { ok: false; error: string }> {
  const parsedId = OrderIdInputSchema.safeParse(order_id);
  if (!parsedId.success) {
    return { ok: false, error: 'Order number format is invalid.' };
  }

  return withTimeout(async () => {
    const cleanId = parsedId.data.toUpperCase();
    const rawList = store.refundHistory[cleanId] || [];
    const parsedList = z.array(RefundRecordSchema).safeParse(rawList);
    if (!parsedList.success) {
      throw new MalformedToolOutputError('Refund history record format is invalid.');
    }
    return { ok: true, history: parsedList.data };
  }, options.timeoutMs ?? 1200);
}

export function check_transaction_status(
  idempotency_key: string,
  store: DemoStore
): { found: boolean; transaction?: TransactionRecord } {
  const parsed = IdempotencyInputSchema.safeParse(idempotency_key);
  if (!parsed.success) return { found: false };
  const tx = store.transactions[parsed.data];
  return tx ? { found: true, transaction: tx } : { found: false };
}

const ExecuteRefundArgsSchema = z.object({
  order_id: OrderIdInputSchema,
  amount: z.number().finite().positive(),
  currency: z.literal('INR'),
  idempotency_key: IdempotencyInputSchema,
});

export interface RefundExecutionResult {
  success: boolean;
  status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'UNKNOWN_OUTCOME';
  refund_id?: string;
  message: string;
  alreadyExecuted?: boolean;
}

export async function execute_simulated_refund(
  order_id: string,
  amount: number,
  currency: string,
  idempotency_key: string,
  authorization_token: string | undefined,
  store: DemoStore,
  options: ToolSimulationOptions = {}
): Promise<RefundExecutionResult> {
  // 1. Validate arguments strictly
  const argsCheck = ExecuteRefundArgsSchema.safeParse({
    order_id,
    amount,
    currency,
    idempotency_key,
  });
  if (!argsCheck.success) {
    return {
      success: false,
      status: 'BLOCKED',
      message: `Invalid refund tool arguments: ${argsCheck.error.issues[0]?.message || 'Validation failed'}.`,
    };
  }

  const cleanId = argsCheck.data.order_id.toUpperCase();

  // 2. Enforce server-side authorization token minted ONLY by deterministic policy gate
  if (!authorization_token) {
    return {
      success: false,
      status: 'BLOCKED',
      message: 'Unauthorized refund attempt: missing server-side policy gate authorization.',
    };
  }

  const tokenGrant = store.authorizedTokens.get(authorization_token);
  if (
    !tokenGrant ||
    tokenGrant.order_id !== cleanId ||
    tokenGrant.amount !== amount ||
    tokenGrant.currency !== currency ||
    tokenGrant.idempotency_key !== idempotency_key ||
    tokenGrant.expiresAt < Date.now()
  ) {
    return {
      success: false,
      status: 'BLOCKED',
      message: 'Unauthorized refund attempt: policy gate authorization token is invalid or expired.',
    };
  }

  // Consume single-use token immediately
  store.authorizedTokens.delete(authorization_token);

  // 3. Check persistent transaction state for idempotency / uncertain outcome BEFORE executing
  const existingTx = store.transactions[idempotency_key];
  if (existingTx) {
    if (existingTx.status === 'SUCCEEDED') {
      return {
        success: false,
        status: 'BLOCKED',
        refund_id: existingTx.refund_id,
        alreadyExecuted: true,
        message: `Duplicate refund prevented. Idempotency key ${idempotency_key} already completed (${existingTx.refund_id}).`,
      };
    }
    if (existingTx.status === 'UNKNOWN_OUTCOME' || existingTx.status === 'PENDING') {
      return {
        success: false,
        status: 'UNKNOWN_OUTCOME',
        message: 'Previous refund outcome could not be confirmed. No second refund will be attempted automatically.',
      };
    }
  }

  // 4. Concurrency lock per order & idempotency key
  const orderLockKey = `ORDER:${cleanId}`;
  if (store.inFlightLocks.has(orderLockKey) || store.inFlightLocks.has(idempotency_key)) {
    return {
      success: false,
      status: 'BLOCKED',
      message: 'Another refund operation is already in progress for this order. Concurrent duplicate blocked.',
    };
  }

  store.inFlightLocks.add(orderLockKey);
  store.inFlightLocks.add(idempotency_key);

  try {
    const order = store.orders[cleanId];
    if (!order) {
      return {
        success: false,
        status: 'FAILED',
        message: `Order ${cleanId} could not be found at execution time.`,
      };
    }

    const history = store.refundHistory[cleanId] || [];
    const totalRefunded = history
      .filter((h) => h.status === 'SUCCEEDED')
      .reduce((sum, h) => sum + h.amount, 0);
    if (amount > order.amount - totalRefunded + 0.001) {
      return {
        success: false,
        status: 'BLOCKED',
        message: `Requested amount (${formatINR(amount)}) exceeds remaining refundable balance (${formatINR(Math.max(0, order.amount - totalRefunded))}).`,
      };
    }

    const nowIso = new Date().toISOString();
    const refund_id = `REF-${Math.floor(100000 + Math.random() * 900000)}`;

    store.transactions[idempotency_key] = {
      idempotency_key,
      order_id: cleanId,
      amount,
      currency,
      status: 'PENDING',
      refund_id,
      created_at: nowIso,
      updated_at: nowIso,
      note: 'Simulated refund execution started.',
    };
    saveStore(store);

    // Handle simulated uncertain timeout during payment execution
    if (options.simulateRefundUncertainTimeout) {
      store.transactions[idempotency_key] = {
        ...store.transactions[idempotency_key],
        status: 'UNKNOWN_OUTCOME',
        updated_at: new Date().toISOString(),
        note: 'Simulated refund gateway timed out after request dispatch; outcome uncertain until reconciled.',
      };
      saveStore(store);
      return {
        success: false,
        status: 'UNKNOWN_OUTCOME',
        refund_id,
        message: 'We could not confirm the refund status because the simulated refund service timed out. No second refund will be attempted automatically.',
      };
    }

    const newRecord: RefundRecord = {
      refund_id,
      order_id: cleanId,
      amount,
      currency,
      timestamp: new Date().toISOString(),
      idempotency_key,
      status: 'SUCCEEDED',
    };

    store.refundHistory[cleanId] = [...history, newRecord];
    const updatedRefunded = totalRefunded + amount;
    order.status = updatedRefunded >= order.amount - 0.01 ? 'refunded' : 'partially_refunded';

    store.transactions[idempotency_key] = {
      ...store.transactions[idempotency_key],
      status: 'SUCCEEDED',
      updated_at: new Date().toISOString(),
      note: `Simulated refund of ${formatINR(amount)} confirmed.`,
    };
    saveStore(store);

    return {
      success: true,
      status: 'SUCCEEDED',
      refund_id,
      message: `Simulated refund of ${formatINR(amount)} confirmed for order ${cleanId} (Transaction ${refund_id}).`,
    };
  } finally {
    store.inFlightLocks.delete(orderLockKey);
    store.inFlightLocks.delete(idempotency_key);
  }
}

export function reconcile_unknown_transaction(
  idempotency_key: string,
  store: DemoStore,
  gatewayConfirmedSuccess = true
): { reconciled: boolean; status: 'SUCCEEDED' | 'FAILED'; refund_id?: string; message: string } {
  const tx = store.transactions[idempotency_key];
  if (!tx) {
    return {
      reconciled: false,
      status: 'FAILED',
      message: 'No pending or unknown transaction record found for this key.',
    };
  }

  if (tx.status === 'SUCCEEDED') {
    return {
      reconciled: true,
      status: 'SUCCEEDED',
      refund_id: tx.refund_id,
      message: `Transaction ${tx.refund_id} was already confirmed as succeeded. No duplicate refund was issued.`,
    };
  }

  if (tx.status !== 'UNKNOWN_OUTCOME' && tx.status !== 'PENDING') {
    return {
      reconciled: false,
      status: 'FAILED',
      message: `Transaction is in state ${tx.status} and cannot be reconciled as unknown.`,
    };
  }

  if (gatewayConfirmedSuccess) {
    const order = store.orders[tx.order_id];
    const history = store.refundHistory[tx.order_id] || [];
    const alreadyRecorded = history.some((r) => r.idempotency_key === idempotency_key);
    const refundId = tx.refund_id || `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!alreadyRecorded && order) {
      store.refundHistory[tx.order_id] = [
        ...history,
        {
          refund_id: refundId,
          order_id: tx.order_id,
          amount: tx.amount,
          currency: tx.currency,
          timestamp: new Date().toISOString(),
          idempotency_key,
          status: 'SUCCEEDED',
        },
      ];
      const totalRefunded = store.refundHistory[tx.order_id]
        .filter((h) => h.status === 'SUCCEEDED')
        .reduce((sum, h) => sum + h.amount, 0);
      order.status = totalRefunded >= order.amount - 0.01 ? 'refunded' : 'partially_refunded';
    }
    store.transactions[idempotency_key] = {
      ...tx,
      status: 'SUCCEEDED',
      refund_id: refundId,
      updated_at: new Date().toISOString(),
      note: 'Reconciled after checking transaction status; confirmed original transaction succeeded without issuing a second refund.',
    };
    saveStore(store);
    return {
      reconciled: true,
      status: 'SUCCEEDED',
      refund_id: refundId,
      message: `Status check confirmed the original simulated refund (${refundId}) for ${formatINR(tx.amount)} succeeded. No second refund was triggered.`,
    };
  }

  store.transactions[idempotency_key] = {
    ...tx,
    status: 'FAILED',
    updated_at: new Date().toISOString(),
    note: 'Reconciled: original transaction did not complete; safe to submit a new request.',
  };
  saveStore(store);
  return {
    reconciled: true,
    status: 'FAILED',
    message: 'Status check confirmed the original refund did not go through. Safe for customer to resubmit.',
  };
}

export function create_support_reply(case_details: {
  customer_name: string;
  order_id: string;
  decision: 'ALLOW' | 'BLOCK' | 'NEEDS_REVIEW';
  plain_reason: string;
  amount?: number;
  refund_id?: string;
  tx_status?: string;
}): string {
  const { customer_name, order_id, decision, plain_reason, amount, refund_id, tx_status } = case_details;
  if (tx_status === 'UNKNOWN_OUTCOME') {
    return `Dear ${customer_name},\n\nWe received your refund request for order ${order_id}, and it passed our eligibility checks. However, we could not confirm the simulated refund status due to a temporary timeout.\n\nNo second refund will be attempted automatically to protect against duplicate charges. Our team will verify the transaction status and update you shortly.`;
  }
  if (decision === 'ALLOW' && tx_status === 'SUCCEEDED') {
    const formatted = amount ? formatINR(amount) : 'the approved amount';
    return `Dear ${customer_name},\n\nYour simulated refund of ${formatted} for order ${order_id} has been approved and recorded (Reference: ${refund_id}).\n\nIn a live store, refunds typically reflect within 3–5 business days. This is a simulated demo transaction.\n\nThank you for shopping with us.`;
  }
  if (decision === 'NEEDS_REVIEW') {
    return `Dear ${customer_name},\n\nThank you for contacting support regarding order ${order_id}. Your request requires human review before a refund can proceed.\n\nDetails: ${plain_reason}\n\nA support specialist will review your case within 24 hours.`;
  }
  return `Dear ${customer_name},\n\nWe reviewed your return request for order ${order_id}, and we are unable to approve a refund at this time.\n\nReason: ${plain_reason}\n\nIf you believe there is an error with your order details, please reply with additional information.`;
}
