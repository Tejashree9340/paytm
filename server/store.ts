import fs from 'fs';
import path from 'path';
import type {
  AuditLogEntry,
  OrderRecord,
  RefundRecord,
  ReturnPolicyRecord,
  TransactionRecord,
} from './types.ts';

export interface DemoStore {
  orders: Record<string, OrderRecord>;
  policies: Record<string, ReturnPolicyRecord>;
  refundHistory: Record<string, RefundRecord[]>;
  transactions: Record<string, TransactionRecord>;
  auditLogs: AuditLogEntry[];
  inFlightLocks: Set<string>;
  authorizedTokens: Map<
    string,
    { order_id: string; amount: number; currency: string; idempotency_key: string; expiresAt: number }
  >;
  isIsolatedTestStore: boolean;
}

const PERSIST_PATH = path.resolve('/tmp', 'returnshield-demo-store.json');

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
}

export function createSeededStore(isIsolatedTestStore = false): DemoStore {
  const orders: Record<string, OrderRecord> = {
    'ORD-101': {
      order_id: 'ORD-101',
      customer_alias: 'Aarav S. (Mumbai)',
      product_name: 'boAt Nirvana Wireless Earbuds',
      product_type: 'electronics',
      purchase_date: daysAgoIso(8),
      delivery_date: daysAgoIso(5),
      amount: 1499.0,
      currency: 'INR',
      status: 'delivered',
      notes: 'Standard prepaid UPI order. No prior return claims.',
    },
    'ORD-102': {
      order_id: 'ORD-102',
      customer_alias: 'Priya P. (Bengaluru)',
      product_name: 'Fabindia Handwoven Silk Kurta',
      product_type: 'clothing',
      purchase_date: daysAgoIso(45),
      delivery_date: daysAgoIso(41),
      amount: 2999.0,
      currency: 'INR',
      status: 'delivered',
      notes: 'Delivered 41 days ago. 15-day return window has elapsed.',
    },
    'ORD-103': {
      order_id: 'ORD-103',
      customer_alias: 'Rohan G. (Delhi)',
      product_name: 'Noise ColorFit Pro Smartwatch',
      product_type: 'electronics',
      purchase_date: daysAgoIso(12),
      delivery_date: daysAgoIso(9),
      amount: 4500.0,
      currency: 'INR',
      status: 'refunded',
      notes: 'Full refund already completed on prior claim.',
    },
    'ORD-104': {
      order_id: 'ORD-104',
      customer_alias: 'Ananya I. (Chennai)',
      product_name: 'Lavie Genuine Leather Laptop Bag',
      product_type: 'accessories',
      purchase_date: daysAgoIso(11),
      delivery_date: daysAgoIso(7),
      amount: 5000.0,
      currency: 'INR',
      status: 'partially_refunded',
      notes: 'Partial refund of ₹2,000.00 already issued for missing strap; ₹3,000.00 remaining.',
    },
    'ORD-105': {
      order_id: 'ORD-105',
      customer_alias: 'Vikram S. (Pune)',
      product_name: 'Imported Espresso Machine',
      product_type: 'appliances',
      purchase_date: daysAgoIso(6),
      delivery_date: daysAgoIso(3),
      amount: 7500.0,
      currency: 'EUR',
      status: 'delivered',
      notes: 'Cross-border EUR order; cannot be refunded directly in INR.',
    },
    'ORD-106': {
      order_id: 'ORD-106',
      customer_alias: 'Meera K. (Jaipur)',
      product_name: 'Handcrafted Miniature Painting',
      product_type: 'custom_artwork',
      purchase_date: daysAgoIso(5),
      delivery_date: daysAgoIso(2),
      amount: 1899.0,
      currency: 'INR',
      status: 'delivered',
      notes: 'Custom category without an automated return policy rule.',
    },
  };

  const policies: Record<string, ReturnPolicyRecord> = {
    electronics: {
      product_type: 'electronics',
      return_window_days: 14,
      max_refund_percentage: 100,
      requires_unused_packaging: true,
      requires_evidence_for_damage: true,
      allow_changed_mind: false,
      policy_summary: 'Electronics: Return within 14 days of delivery in original packaging. Photo/evidence required for damage claims.',
    },
    clothing: {
      product_type: 'clothing',
      return_window_days: 15,
      max_refund_percentage: 100,
      requires_unused_packaging: true,
      requires_evidence_for_damage: false,
      allow_changed_mind: true,
      policy_summary: 'Clothing: Return within 15 days of delivery, unused with tags and original packaging.',
    },
    accessories: {
      product_type: 'accessories',
      return_window_days: 30,
      max_refund_percentage: 100,
      requires_unused_packaging: false,
      requires_evidence_for_damage: true,
      allow_changed_mind: true,
      policy_summary: 'Accessories: Return within 30 days of delivery. Evidence required if reporting product damage.',
    },
    appliances: {
      product_type: 'appliances',
      return_window_days: 10,
      max_refund_percentage: 100,
      requires_unused_packaging: true,
      requires_evidence_for_damage: true,
      allow_changed_mind: false,
      policy_summary: 'Appliances: Return within 10 days of delivery with original box and damage evidence.',
    },
  };

  const refundHistory: Record<string, RefundRecord[]> = {
    'ORD-101': [],
    'ORD-102': [],
    'ORD-103': [
      {
        refund_id: 'REF-889921',
        order_id: 'ORD-103',
        amount: 4500.0,
        currency: 'INR',
        timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
        idempotency_key: 'SEED-ORD-103-FULL',
        status: 'SUCCEEDED',
      },
    ],
    'ORD-104': [
      {
        refund_id: 'REF-334411',
        order_id: 'ORD-104',
        amount: 2000.0,
        currency: 'INR',
        timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
        idempotency_key: 'SEED-ORD-104-PARTIAL',
        status: 'SUCCEEDED',
      },
    ],
    'ORD-105': [],
    'ORD-106': [],
  };

  const transactions: Record<string, TransactionRecord> = {
    'SEED-ORD-103-FULL': {
      idempotency_key: 'SEED-ORD-103-FULL',
      order_id: 'ORD-103',
      amount: 4500.0,
      currency: 'INR',
      status: 'SUCCEEDED',
      refund_id: 'REF-889921',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      note: 'Seeded demo transaction (Order C already refunded).',
    },
    'SEED-ORD-104-PARTIAL': {
      idempotency_key: 'SEED-ORD-104-PARTIAL',
      order_id: 'ORD-104',
      amount: 2000.0,
      currency: 'INR',
      status: 'SUCCEEDED',
      refund_id: 'REF-334411',
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      note: 'Seeded demo transaction (Order D partial refund).',
    },
  };

  return {
    orders,
    policies,
    refundHistory,
    transactions,
    auditLogs: [],
    inFlightLocks: new Set<string>(),
    authorizedTokens: new Map(),
    isIsolatedTestStore,
  };
}

function loadPrimaryStore(): DemoStore {
  try {
    if (fs.existsSync(PERSIST_PATH)) {
      const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.orders && parsed.policies && parsed.refundHistory) {
        return {
          orders: parsed.orders,
          policies: parsed.policies,
          refundHistory: parsed.refundHistory,
          transactions: parsed.transactions || {},
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          inFlightLocks: new Set<string>(),
          authorizedTokens: new Map(),
          isIsolatedTestStore: false,
        };
      }
    }
  } catch {
    // Fall back to fresh seeded store if file is unreadable
  }
  const seeded = createSeededStore(false);
  saveStore(seeded);
  return seeded;
}

export function saveStore(store: DemoStore): void {
  if (store.isIsolatedTestStore) return;
  try {
    const serializable = {
      orders: store.orders,
      policies: store.policies,
      refundHistory: store.refundHistory,
      transactions: store.transactions,
      auditLogs: store.auditLogs.slice(-250),
    };
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(serializable, null, 2), 'utf-8');
  } catch {
    // Non-fatal in ephemeral containers; in-memory state remains active
  }
}

export let primaryStore: DemoStore = loadPrimaryStore();

export function resetPrimaryStore(): DemoStore {
  primaryStore = createSeededStore(false);
  saveStore(primaryStore);
  return primaryStore;
}

export function appendAuditLog(store: DemoStore, entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const fullEntry: AuditLogEntry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  store.auditLogs.push(fullEntry);
  saveStore(store);
  return fullEntry;
}
