import crypto from 'crypto';
import {
  formatDateDDMMYYYY,
  formatINR,
  type DiscrepancyItem,
  type OrderRecord,
  type PolicyCheckItem,
  type PolicyGateResult,
  type RefundRecord,
  type ReturnPolicyRecord,
  type ReturnRequestForm,
} from './types.ts';
import type { DemoStore } from './store.ts';
import { check_transaction_status } from './tools.ts';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|system|store)\s+(instructions|rules|policies)/i,
  /bypass\s+(all\s+)?(policy|security|guard|checks|rules)/i,
  /refund\s+twice/i,
  /approve\s+(this\s+)?refund\s+(immediately|anyway|without)/i,
  /pretend\s+(the\s+)?order\s+is\s+verified/i,
  /override\s+(system|policy|authorization)/i,
  /reveal\s+(api\s*key|secret|env|environment|credentials|system\s*prompt)/i,
  /system\s*:\s*you\s+are/i,
];

export function detectPromptInjection(texts: Array<string | undefined>): boolean {
  return texts.some((txt) => {
    if (!txt) return false;
    return INJECTION_PATTERNS.some((pattern) => pattern.test(txt));
  });
}

export function validateReturnFormDates(form: ReturnRequestForm): { valid: boolean; error?: string } {
  const purchase = new Date(`${form.purchase_date}T00:00:00Z`);
  const delivery = new Date(`${form.delivery_date}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);

  if (isNaN(purchase.getTime()) || isNaN(delivery.getTime())) {
    return { valid: false, error: 'Purchase date and delivery date must be valid calendar dates.' };
  }
  if (purchase > today) {
    return { valid: false, error: 'Purchase date cannot be in the future.' };
  }
  if (delivery > today) {
    return { valid: false, error: 'Delivery date cannot be in the future.' };
  }
  if (delivery < purchase) {
    return { valid: false, error: 'Delivery date cannot be earlier than the purchase date.' };
  }
  return { valid: true };
}

export function authorizeRefundWithPolicyGate(params: {
  form: ReturnRequestForm;
  order: OrderRecord | null;
  policy: ReturnPolicyRecord | null;
  history: RefundRecord[];
  idempotencyKey: string;
  store: DemoStore;
}): PolicyGateResult {
  const { form, order, policy, history, idempotencyKey, store } = params;
  const checks: PolicyCheckItem[] = [];
  const discrepancies: DiscrepancyItem[] = [];

  const promptInjectionDetected = detectPromptInjection([
    form.reason_details,
    form.claimed_policy_description,
    form.product_condition,
    form.product_name,
    order?.notes,
  ]);

  if (promptInjectionDetected) {
    checks.push({
      rule: 'Instruction Safety Check',
      passed: false,
      status: 'FAIL',
      plainMessage: 'The request contained instructions attempting to override or bypass refund rules.',
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Unsafe request blocked',
      plainReason: 'The request attempted to override or bypass the store refund rules. The security guard blocked execution.',
      technicalReason: 'PROMPT_INJECTION_DETECTED',
      checks,
      discrepancies,
      promptInjectionDetected: true,
      remainingRefundable: 0,
      evidence: { order_id: form.order_number },
    };
  }

  checks.push({
    rule: 'Instruction Safety Check',
    passed: true,
    status: 'PASS',
    plainMessage: 'No rule-bypass or unsafe instructions detected in submitted text.',
  });

  // 1. Trusted order existence
  if (!order) {
    checks.push({
      rule: 'Trusted Order Verification',
      passed: false,
      status: 'FAIL',
      plainMessage: `We couldn't find order ${form.order_number.toUpperCase()} in the trusted store records.`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Order not found',
      plainReason: `We couldn't find this order number (${form.order_number.toUpperCase()}). No refund was issued.`,
      technicalReason: 'ORDER_NOT_FOUND',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable: 0,
      evidence: { order_id: form.order_number },
    };
  }

  checks.push({
    rule: 'Trusted Order Verification',
    passed: true,
    status: 'PASS',
    plainMessage: `Order ${order.order_id} verified in store records.`,
  });

  // 2. Compare customer claims against trusted order records
  if (form.product_name.trim().toLowerCase() !== order.product_name.trim().toLowerCase()) {
    discrepancies.push({
      field: 'Product Name',
      customerClaim: form.product_name,
      trustedRecord: order.product_name,
      severity: 'CRITICAL',
    });
  }
  if (form.purchase_date !== order.purchase_date) {
    discrepancies.push({
      field: 'Purchase Date',
      customerClaim: formatDateDDMMYYYY(form.purchase_date),
      trustedRecord: formatDateDDMMYYYY(order.purchase_date),
      severity: 'WARNING',
    });
  }
  if (form.delivery_date !== order.delivery_date) {
    discrepancies.push({
      field: 'Delivery Date',
      customerClaim: formatDateDDMMYYYY(form.delivery_date),
      trustedRecord: formatDateDDMMYYYY(order.delivery_date),
      severity: 'CRITICAL',
    });
  }
  if (Math.abs(form.original_amount_paid - order.amount) > 0.01) {
    discrepancies.push({
      field: 'Original Amount Paid',
      customerClaim: formatINR(form.original_amount_paid),
      trustedRecord: `${formatINR(order.amount)} (${order.currency})`,
      severity: 'CRITICAL',
    });
  }

  // 3. Currency check (never silently convert)
  if (order.currency !== 'INR' || form.currency !== order.currency) {
    checks.push({
      rule: 'Currency Verification',
      passed: false,
      status: 'FAIL',
      plainMessage: `Order was billed in ${order.currency}, which does not match requested currency ${form.currency}.`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Currency mismatch',
      plainReason: `This order was placed in ${order.currency}, not INR. We cannot convert currencies automatically or issue an INR refund.`,
      technicalReason: 'CURRENCY_MISMATCH',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable: 0,
      evidence: { order_currency: order.currency, requested_currency: form.currency },
    };
  }

  checks.push({
    rule: 'Currency Verification',
    passed: true,
    status: 'PASS',
    plainMessage: 'Order currency (INR) matches the refund request.',
  });

  // 4. Verified policy check (never trust customer-entered policy text)
  if (!policy) {
    checks.push({
      rule: 'Trusted Store Policy Check',
      passed: false,
      status: 'WARN',
      plainMessage: `No verified policy found for category "${order.product_type}". Customer policy text cannot authorize a refund.`,
    });
    return {
      decision: 'NEEDS_REVIEW',
      plainTitle: 'Human review required',
      plainReason: 'We could not find a verified store return policy for this product category. This request needs human review before a refund can proceed.',
      technicalReason: 'MISSING_TRUSTED_POLICY',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable: 0,
      evidence: { product_type: order.product_type },
    };
  }

  if (form.claimed_return_window_days !== policy.return_window_days) {
    discrepancies.push({
      field: 'Return Window',
      customerClaim: `${form.claimed_return_window_days} days ("${form.claimed_policy_description}")`,
      trustedRecord: `${policy.return_window_days} days (${policy.policy_summary})`,
      severity: 'WARNING',
    });
  }

  checks.push({
    rule: 'Trusted Store Policy Check',
    passed: true,
    status: 'PASS',
    plainMessage: `Verified store policy loaded (${policy.return_window_days}-day window for ${policy.product_type}).`,
  });

  // 5. Critical order record mismatch check
  const criticalMismatch = discrepancies.find(
    (d) => d.severity === 'CRITICAL' && (d.field === 'Original Amount Paid' || d.field === 'Product Name' || d.field === 'Delivery Date')
  );
  if (criticalMismatch) {
    checks.push({
      rule: 'Customer Claim vs Order Record',
      passed: false,
      status: 'FAIL',
      plainMessage: `Submitted ${criticalMismatch.field.toLowerCase()} (${criticalMismatch.customerClaim}) does not match trusted record (${criticalMismatch.trustedRecord}).`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Order details mismatch',
      plainReason: `The submitted ${criticalMismatch.field.toLowerCase()} does not match our verified order record. Please review your order details and submit again.`,
      technicalReason: 'ORDER_CLAIM_MISMATCH',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable: 0,
      evidence: { discrepancies },
    };
  }

  checks.push({
    rule: 'Customer Claim vs Order Record',
    passed: true,
    status: 'PASS',
    plainMessage: 'Product name, delivery date, and purchase amount match trusted records.',
  });

  // 6. Refund history, full/partial refunds, concurrency, and uncertain transaction checks
  const txLookup = check_transaction_status(idempotencyKey, store);
  if (txLookup.found && txLookup.transaction) {
    if (txLookup.transaction.status === 'UNKNOWN_OUTCOME' || txLookup.transaction.status === 'PENDING') {
      checks.push({
        rule: 'Transaction & Idempotency Check',
        passed: false,
        status: 'WARN',
        plainMessage: 'A previous transaction with this idempotency key has an unconfirmed status.',
      });
      return {
        decision: 'NEEDS_REVIEW',
        plainTitle: 'Transaction status uncertain',
        plainReason: 'We could not confirm the refund status from an earlier attempt. No second refund will be attempted automatically.',
        technicalReason: 'UNKNOWN_TRANSACTION_OUTCOME',
        checks,
        discrepancies,
        promptInjectionDetected: false,
        remainingRefundable: 0,
        evidence: { idempotencyKey, txStatus: txLookup.transaction.status },
      };
    }
    if (txLookup.transaction.status === 'SUCCEEDED') {
      checks.push({
        rule: 'Transaction & Idempotency Check',
        passed: false,
        status: 'FAIL',
        plainMessage: `Duplicate request detected for idempotency key ${idempotencyKey}.`,
      });
      return {
        decision: 'BLOCK',
        plainTitle: 'Duplicate refund blocked',
        plainReason: 'This refund request has already been processed. No second refund was issued.',
        technicalReason: 'DUPLICATE_IDEMPOTENCY_KEY',
        checks,
        discrepancies,
        promptInjectionDetected: false,
        remainingRefundable: 0,
        evidence: { idempotencyKey, refund_id: txLookup.transaction.refund_id },
      };
    }
  }

  if (store.inFlightLocks.has(`ORDER:${order.order_id}`) || store.inFlightLocks.has(idempotencyKey)) {
    checks.push({
      rule: 'Concurrency Lock Check',
      passed: false,
      status: 'FAIL',
      plainMessage: 'Another refund operation is currently executing for this order.',
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Concurrent refund blocked',
      plainReason: 'Another refund is already being processed for this order. Please wait for it to finish.',
      technicalReason: 'CONCURRENT_REFUND_LOCK',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable: 0,
      evidence: { order_id: order.order_id },
    };
  }

  const totalRefunded = history
    .filter((h) => h.status === 'SUCCEEDED')
    .reduce((sum, h) => sum + h.amount, 0);
  const remainingRefundable = Math.max(0, Number((order.amount - totalRefunded).toFixed(2)));

  if (order.status === 'refunded' || remainingRefundable <= 0) {
    checks.push({
      rule: 'Remaining Balance Check',
      passed: false,
      status: 'FAIL',
      plainMessage: `Order already refunded ${formatINR(totalRefunded)} out of ${formatINR(order.amount)}.`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Already fully refunded',
      plainReason: 'This order has already been fully refunded. No additional refund was issued.',
      technicalReason: 'ALREADY_FULLY_REFUNDED',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable: 0,
      evidence: { totalRefunded, orderAmount: order.amount, remainingRefundable },
    };
  }

  if (form.requested_refund_amount <= 0 || form.requested_refund_amount > remainingRefundable) {
    checks.push({
      rule: 'Remaining Balance Check',
      passed: false,
      status: 'FAIL',
      plainMessage: `Requested ${formatINR(form.requested_refund_amount)} exceeds remaining refundable balance of ${formatINR(remainingRefundable)}.`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Amount exceeds refundable balance',
      plainReason: `The amount requested (${formatINR(form.requested_refund_amount)}) is higher than the remaining refundable balance (${formatINR(remainingRefundable)}).`,
      technicalReason: 'EXCEEDS_REMAINING_BALANCE',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable,
      evidence: { requested: form.requested_refund_amount, totalRefunded, remainingRefundable },
    };
  }

  checks.push({
    rule: 'Remaining Balance Check',
    passed: true,
    status: 'PASS',
    plainMessage: `Requested ${formatINR(form.requested_refund_amount)} is within the remaining refundable balance (${formatINR(remainingRefundable)}).`,
  });

  // 7. Trusted return window check (using trusted delivery_date!)
  const deliveryDt = new Date(`${order.delivery_date}T00:00:00Z`);
  const now = new Date();
  const daysSinceDelivery = Math.floor((now.getTime() - deliveryDt.getTime()) / 86400000);

  if (daysSinceDelivery > policy.return_window_days) {
    checks.push({
      rule: 'Return Window Check',
      passed: false,
      status: 'FAIL',
      plainMessage: `Delivered ${daysSinceDelivery} days ago (${formatDateDDMMYYYY(order.delivery_date)}), past the ${policy.return_window_days}-day policy limit.`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Return window expired',
      plainReason: `The return deadline has passed. Your order was delivered ${daysSinceDelivery} days ago, which exceeds the ${policy.return_window_days}-day store return window.`,
      technicalReason: 'RETURN_WINDOW_EXPIRED',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable,
      evidence: { daysSinceDelivery, limitDays: policy.return_window_days, deliveryDate: order.delivery_date },
    };
  }

  checks.push({
    rule: 'Return Window Check',
    passed: true,
    status: 'PASS',
    plainMessage: `Delivered ${daysSinceDelivery} days ago, within the ${policy.return_window_days}-day store limit.`,
  });

  // 8. Policy reason, condition, and evidence rules
  if (form.reason_for_return === 'Changed my mind' && !policy.allow_changed_mind) {
    checks.push({
      rule: 'Return Reason Eligibility',
      passed: false,
      status: 'FAIL',
      plainMessage: `Store policy for ${policy.product_type} does not accept "Changed my mind" returns.`,
    });
    return {
      decision: 'BLOCK',
      plainTitle: 'Reason not covered by policy',
      plainReason: `Store policy for ${policy.product_type} items does not allow returns for "Changed my mind".`,
      technicalReason: 'REASON_NOT_ELIGIBLE',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable,
      evidence: { reason: form.reason_for_return, product_type: policy.product_type },
    };
  }

  if (form.reason_for_return === 'Damaged product' && policy.requires_evidence_for_damage && form.evidence_availability === 'Not available') {
    checks.push({
      rule: 'Damage Evidence Requirement',
      passed: false,
      status: 'WARN',
      plainMessage: 'Store policy requires evidence for damaged item claims, and none is available.',
    });
    return {
      decision: 'NEEDS_REVIEW',
      plainTitle: 'Evidence needed for review',
      plainReason: 'This request needs human review before a refund can proceed because damage evidence was marked unavailable.',
      technicalReason: 'EVIDENCE_REQUIRED_FOR_DAMAGE',
      checks,
      discrepancies,
      promptInjectionDetected: false,
      remainingRefundable,
      evidence: { evidence_availability: form.evidence_availability },
    };
  }

  // Mint single-use server authorization token for execute_simulated_refund
  const authorizationToken = `AUTH-${crypto.randomBytes(12).toString('hex')}`;
  store.authorizedTokens.set(authorizationToken, {
    order_id: order.order_id,
    amount: form.requested_refund_amount,
    currency: order.currency,
    idempotency_key: idempotencyKey,
    expiresAt: Date.now() + 60_000,
  });

  checks.push({
    rule: 'Policy Eligibility & Authorization',
    passed: true,
    status: 'PASS',
    plainMessage: 'All deterministic store checks passed. Refund execution authorized.',
  });

  return {
    decision: 'ALLOW',
    plainTitle: 'Refund approved',
    plainReason:
      discrepancies.length > 0
        ? `Verified against trusted store records (${discrepancies[0].field} note recorded). Store rules allow this ${formatINR(form.requested_refund_amount)} refund.`
        : `All trusted order, balance, and return-window checks passed for ${formatINR(form.requested_refund_amount)}.`,
    technicalReason: 'POLICY_GATE_ALLOW',
    checks,
    discrepancies,
    promptInjectionDetected: false,
    remainingRefundable,
    evidence: {
      order_id: order.order_id,
      requested_amount: form.requested_refund_amount,
      remainingRefundable,
      daysSinceDelivery,
      policy_limit_days: policy.return_window_days,
    },
    authorizationToken,
  };
}
