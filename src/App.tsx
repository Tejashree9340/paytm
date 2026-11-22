import React, { useCallback, useEffect, useState } from 'react';
import {
  INITIAL_FORM_VALUES,
  type AuditLogEntry,
  type CaseInvestigationResponse,
  type CaseState,
  type FormValues,
  type OrderRecord,
  type TestLabReport,
  type ToolCallTrace,
} from './types/returnshield';
import { CustomerReturnForm } from './components/CustomerReturnForm';
import { LiveAgentWorkflow } from './components/LiveAgentWorkflow';
import { AuditTrailPanel } from './components/AuditTrailPanel';
import { TestLabPanel } from './components/TestLabPanel';
import { DemoCasesPanel } from './components/DemoCasesPanel';

type ActiveSection = 'request' | 'workflow' | 'audit' | 'tests' | 'demo';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('request');

  // Form state (starts empty for order/amount; never auto-submits on load)
  const [formValues, setFormValues] = useState<FormValues>(INITIAL_FORM_VALUES);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitBannerError, setSubmitBannerError] = useState<string>('');

  // Live workflow & results state
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [currentState, setCurrentState] = useState<CaseState>('IDLE');
  const [activeAgent, setActiveAgent] = useState<string>('');
  const [liveMessage, setLiveMessage] = useState<string>('');
  const [toolCalls, setToolCalls] = useState<ToolCallTrace[]>([]);
  const [caseResult, setCaseResult] = useState<CaseInvestigationResponse | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  // Demo data & audit trail
  const [demoOrders, setDemoOrders] = useState<OrderRecord[]>([]);
  const [refundHistory, setRefundHistory] = useState<
    Record<string, Array<{ refund_id: string; amount: number; status: string; timestamp: string }>>
  >({});
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [persistenceNotice, setPersistenceNotice] = useState<string>('');
  const [demoLoading, setDemoLoading] = useState(false);

  // Test Lab
  const [testReport, setTestReport] = useState<TestLabReport | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const fetchDemoData = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch('/api/demo/data');
      if (!res.ok) return;
      const data = await res.json();
      setDemoOrders(data.orders || []);
      setRefundHistory(data.refundHistory || {});
      setAuditLogs(data.auditLogs || []);
      setPersistenceNotice(data.persistenceNotice || '');
    } catch {
      // Keep existing state if background refresh fails
    } finally {
      setDemoLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDemoData();
  }, [fetchDemoData]);

  const handleResetDemoData = async () => {
    setDemoLoading(true);
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
      setCaseResult(null);
      setToolCalls([]);
      setCurrentState('IDLE');
      setActiveAgent('');
      setLiveMessage('');
      await fetchDemoData();
    } finally {
      setDemoLoading(false);
    }
  };

  const handleLoadDemoPreset = (values: FormValues) => {
    setFormValues(values);
    setServerErrors({});
    setSubmitBannerError('');
    setActiveSection('request');
  };

  const handleSubmitReturnRequest = async (validatedPayload: Record<string, unknown>) => {
    setIsInvestigating(true);
    setServerErrors({});
    setSubmitBannerError('');
    setToolCalls([]);
    setCaseResult(null);
    setCurrentState('RECEIVED');
    setActiveAgent('Intake');
    setLiveMessage('Submitting return request to ReturnShield AI backend...');
    setActiveSection('workflow');

    try {
      const res = await fetch('/api/cases/investigate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validatedPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.fieldErrors) {
          setServerErrors(errData.fieldErrors);
        }
        setSubmitBannerError(errData.error || 'Submission failed validation.');
        setCurrentState('IDLE');
        setActiveSection('request');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response is not supported by this browser.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const line = chunk
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'state') {
            setCurrentState(payload.state);
            setActiveAgent(payload.agent);
            setLiveMessage(payload.message);
          } else if (payload.type === 'tool') {
            const incoming: ToolCallTrace = payload.trace;
            setToolCalls((prev) => {
              const idx = prev.findIndex((t) => t.id === incoming.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = incoming;
                return updated;
              }
              return [...prev, incoming];
            });
          } else if (payload.type === 'audit') {
            setAuditLogs((prev) => [payload.entry, ...prev]);
          } else if (payload.type === 'complete') {
            const finalResult: CaseInvestigationResponse = payload.result;
            setCaseResult(finalResult);
            setCurrentState(finalResult.state);
            setToolCalls(finalResult.toolCalls);
            setLiveMessage(finalResult.plainReason);
          } else if (payload.type === 'error') {
            setCurrentState('FAILED');
            setLiveMessage(payload.error || 'Investigation failed unexpectedly.');
          }
        }
      }

      await fetchDemoData();
    } catch (err: any) {
      setCurrentState('FAILED');
      setLiveMessage(err?.message || 'Network failure while running investigation.');
    } finally {
      setIsInvestigating(false);
    }
  };

  const handleReconcile = async (idempotencyKey: string, caseId: string) => {
    setIsReconciling(true);
    try {
      const res = await fetch('/api/cases/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, caseId, gatewayConfirmedSuccess: true }),
      });
      const data = await res.json();
      if (res.ok && caseResult) {
        setCaseResult({
          ...caseResult,
          state: data.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
          decision: data.status === 'SUCCEEDED' ? 'ALLOW' : 'BLOCK',
          plainTitle: data.status === 'SUCCEEDED' ? 'Transaction verified & reconciled' : 'Transaction failed on check',
          plainReason: data.message,
          transactionStatus: data.status,
          refundedAmount: data.status === 'SUCCEEDED' ? caseResult.requestedAmount : 0,
          refundId: data.refund_id || caseResult.refundId,
          canReconcile: false,
          furtherActionNeeded: 'Reconciliation complete. No duplicate refund was issued.',
        });
        setCurrentState(data.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED');
        setLiveMessage(data.message);
        await fetchDemoData();
      }
    } finally {
      setIsReconciling(false);
    }
  };

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch('/api/tests/run', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setTestReport(data);
      }
    } finally {
      setIsRunningTests(false);
    }
  };

  const navItems: Array<{ id: ActiveSection; label: string }> = [
    { id: 'request', label: 'Return Request' },
    { id: 'workflow', label: 'Live Workflow' },
    { id: 'audit', label: 'Audit Trail' },
    { id: 'tests', label: 'Test Lab' },
    { id: 'demo', label: 'Demo Cases' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F5] text-stone-900">
      {/* Clean 3-zone Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => setActiveSection('request')}
            className="text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            ReturnShield AI
          </button>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 cursor-pointer ${
                  activeSection === item.id
                    ? 'text-orange-600 border-b-2 border-orange-600'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleResetDemoData}
              disabled={demoLoading}
              className="px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reset Demo Data
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden border-t border-stone-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeSection === item.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-stone-100 text-stone-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {submitBannerError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {submitBannerError}
          </div>
        )}

        {activeSection === 'request' && (
          <CustomerReturnForm
            values={formValues}
            onChange={setFormValues}
            onSubmit={handleSubmitReturnRequest}
            onOpenDemoCases={() => setActiveSection('demo')}
            isSubmitting={isInvestigating}
            serverErrors={serverErrors}
          />
        )}

        {activeSection === 'workflow' && (
          <LiveAgentWorkflow
            currentState={currentState}
            activeAgent={activeAgent}
            liveMessage={liveMessage}
            toolCalls={toolCalls}
            result={caseResult}
            isRunning={isInvestigating}
            onReconcile={handleReconcile}
            isReconciling={isReconciling}
          />
        )}

        {activeSection === 'audit' && <AuditTrailPanel entries={auditLogs} />}

        {activeSection === 'tests' && (
          <TestLabPanel
            report={testReport}
            isRunning={isRunningTests}
            onRunTests={handleRunTests}
          />
        )}

        {activeSection === 'demo' && (
          <DemoCasesPanel
            orders={demoOrders}
            refundHistory={refundHistory}
            persistenceNotice={persistenceNotice}
            isLoading={demoLoading}
            onLoadPreset={handleLoadDemoPreset}
            onResetDemoData={handleResetDemoData}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-4 px-6 text-center text-xs text-stone-500">
        ReturnShield AI · Simulated Demo Environment (INR ₹) · No real payments or external bank transactions are executed.
      </footer>
    </div>
  );
}
