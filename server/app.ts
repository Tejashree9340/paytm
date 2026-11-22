import express from 'express';
import dotenv from 'dotenv';
import { ReturnRequestFormSchema } from './types.ts';
import { appendAuditLog, primaryStore, resetPrimaryStore } from './store.ts';
import { validateReturnFormDates } from './policyGate.ts';
import { runCaseWorkflow } from './agents.ts';
import { check_transaction_status, reconcile_unknown_transaction } from './tools.ts';
import { runTestLabSuite } from './testLab.ts';

dotenv.config();

function validateFormPayload(body: unknown) {
  const parsed = ReturnRequestFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] || 'form');
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message || 'Please fix the highlighted form errors.',
      fieldErrors,
    };
  }

  const dateCheck = validateReturnFormDates(parsed.data);
  if (!dateCheck.valid) {
    return {
      ok: false as const,
      error: dateCheck.error || 'Dates are inconsistent.',
      fieldErrors: { delivery_date: dateCheck.error || 'Invalid dates.' },
    };
  }

  return { ok: true as const, data: parsed.data };
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.post('/api/cases/investigate', async (req, res) => {
    const validation = validateFormPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      });
    }

    try {
      const result = await runCaseWorkflow(validation.data, primaryStore);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({
        error: 'Unexpected error while running the refund investigation.',
        details: err?.message || 'Internal error',
      });
    }
  });

  app.post('/api/cases/investigate-stream', async (req, res) => {
    const validation = validateFormPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await runCaseWorkflow(validation.data, primaryStore, {
        onEvent: (event) => {
          sendEvent(event);
        },
      });
    } catch (err: any) {
      sendEvent({
        type: 'error',
        error: err?.message || 'Investigation failed unexpectedly.',
      });
    } finally {
      res.end();
    }
  });

  app.post('/api/cases/reconcile', (req, res) => {
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    const caseId = typeof req.body?.caseId === 'string' ? req.body.caseId.trim() : 'RECONCILE';
    const confirmedSuccess = req.body?.gatewayConfirmedSuccess !== false;

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Idempotency key is required to check transaction status.' });
    }

    const statusBefore = check_transaction_status(idempotencyKey, primaryStore);
    if (!statusBefore.found) {
      return res.status(404).json({ error: 'No transaction found for this idempotency key.' });
    }

    const result = reconcile_unknown_transaction(idempotencyKey, primaryStore, confirmedSuccess);
    appendAuditLog(primaryStore, {
      case_id: caseId,
      stage: 'RECONCILIATION',
      actor: 'Transaction Reconciler',
      message: result.message,
      details: { idempotencyKey, status: result.status, refund_id: result.refund_id },
    });

    return res.json({
      ...result,
      transaction: check_transaction_status(idempotencyKey, primaryStore).transaction,
      auditTrail: primaryStore.auditLogs.slice(-40),
    });
  });

  app.get('/api/demo/data', (_req, res) => {
    res.json({
      isDemoEnvironment: true,
      persistenceNotice: 'Demo data is stored in temporary server storage (/tmp + memory) and resets on cold starts.',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      orders: Object.values(primaryStore.orders),
      policies: primaryStore.policies,
      refundHistory: primaryStore.refundHistory,
      transactions: Object.values(primaryStore.transactions),
      auditLogs: [...primaryStore.auditLogs].reverse().slice(0, 60),
    });
  });

  app.post('/api/demo/reset', (_req, res) => {
    resetPrimaryStore();
    res.json({
      success: true,
      message: 'Demo orders, refund history, transactions, and audit logs reset to initial defaults.',
    });
  });

  app.post('/api/tests/run', async (_req, res) => {
    try {
      const report = await runTestLabSuite();
      return res.json(report);
    } catch (err: any) {
      return res.status(500).json({
        error: 'Test suite failed to execute.',
        details: err?.message || 'Internal error',
      });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ReturnShield AI' });
  });

  return app;
}
