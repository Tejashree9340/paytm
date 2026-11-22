import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  formatDateDDMMYYYY,
  formatINR,
  type CaseInvestigationResponse,
  type CaseState,
  type ToolCallTrace,
} from '../types/returnshield';

interface LiveAgentWorkflowProps {
  currentState: CaseState;
  activeAgent: string;
  liveMessage: string;
  toolCalls: ToolCallTrace[];
  result: CaseInvestigationResponse | null;
  isRunning: boolean;
  onReconcile: (idempotencyKey: string, caseId: string) => void;
  isReconciling: boolean;
}

export const LiveAgentWorkflow: React.FC<LiveAgentWorkflowProps> = ({
  currentState,
  activeAgent,
  liveMessage,
  toolCalls,
  result,
  isRunning,
  onReconcile,
  isReconciling,
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const getStageStatus = (stageIndex: 1 | 2 | 3) => {
    if (currentState === 'IDLE') return 'idle';

    if (stageIndex === 1) {
      if (currentState === 'RECEIVED' || currentState === 'VALIDATING' || activeAgent === 'Order Investigator') {
        if (currentState === 'FAILED' && toolCalls.some((t) => t.agent === 'Order Investigator' && t.status === 'FAILED')) {
          return 'failed';
        }
        return isRunning && activeAgent === 'Order Investigator' ? 'running' : 'completed';
      }
      const invFailed = toolCalls.some((t) => t.agent === 'Order Investigator' && t.status === 'FAILED');
      if (invFailed && currentState === 'FAILED') return 'failed';
      return toolCalls.length > 0 ? 'completed' : 'idle';
    }

    if (stageIndex === 2) {
      if (isRunning && activeAgent === 'Safety & Policy Checker') return 'running';
      if (result?.decision === 'ALLOW') return 'completed';
      if (result?.decision === 'BLOCK') return 'blocked';
      if (result?.decision === 'NEEDS_REVIEW') return 'review';
      const gateTrace = toolCalls.find((t) => t.agent === 'Safety & Policy Checker');
      if (gateTrace?.status === 'COMPLETED') return 'completed';
      if (gateTrace?.status === 'BLOCKED') return 'blocked';
      return 'idle';
    }

    // stageIndex === 3
    if (isRunning && activeAgent === 'Resolution Agent') return 'running';
    if (currentState === 'SUCCEEDED') return 'completed';
    if (currentState === 'UNKNOWN_OUTCOME') return 'review';
    if (currentState === 'FAILED') return 'failed';
    if (currentState === 'BLOCKED') return 'blocked';
    if (currentState === 'NEEDS_REVIEW') return 'review';
    return 'idle';
  };

  const s1 = getStageStatus(1);
  const s2 = getStageStatus(2);
  const s3 = getStageStatus(3);

  const stageStyle = (status: string) => {
    switch (status) {
      case 'running':
        return 'border-orange-500 bg-orange-50/40';
      case 'completed':
        return 'border-emerald-500 bg-emerald-50/30';
      case 'blocked':
      case 'failed':
        return 'border-red-400 bg-red-50/30';
      case 'review':
        return 'border-amber-400 bg-amber-50/40';
      default:
        return 'border-stone-200 bg-stone-50/60';
    }
  };

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 text-orange-600 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'blocked':
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'review':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      default:
        return <Clock className="w-4 h-4 text-stone-400" />;
    }
  };

  const toolBadgeStyle = (status: ToolCallTrace['status']) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'RUNNING':
      case 'RETRYING':
        return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'BLOCKED':
      case 'FAILED':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'UNKNOWN_OUTCOME':
        return 'text-amber-700 bg-amber-50 border-amber-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 2: Live Agent Workflow */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-stone-200">
          <div>
            <h2 className="text-xl font-bold text-stone-900 tracking-tight">Live Agent Workflow</h2>
            <p className="text-sm text-stone-600 mt-0.5">
              {liveMessage || 'Submit a return request to watch the three stages and real tool calls execute.'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono shrink-0">
            <span className="text-stone-500">State:</span>
            <span className="font-semibold text-stone-900">{currentState}</span>
          </div>
        </div>

        {/* 3 Connected Agent Nodes */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-3">
          {/* Agent 1 */}
          <div className={`border rounded-xl p-5 transition-colors flex flex-col justify-between ${stageStyle(s1)}`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-stone-500">Stage 01</span>
                {renderStatusIcon(s1)}
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <Search className="w-4 h-4 text-orange-600 shrink-0" />
                <h3 className="text-sm font-bold text-stone-900">Order Investigator</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Calls order lookup, policy lookup, and refund history tools, then compares claims against trusted records.
              </p>
            </div>
            {result?.agent1Findings && (
              <div className="mt-4 pt-3 border-t border-stone-200/80 text-xs space-y-1 text-stone-700">
                <div className="font-medium">
                  {result.agent1Findings.orderFound && result.agent1Findings.order
                    ? `${result.agent1Findings.order.order_id} · ${formatINR(result.agent1Findings.order.amount)}`
                    : 'Order record not found'}
                </div>
                <div className="text-stone-500">
                  Discrepancies found: {result.agent1Findings.discrepancies.length}
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center justify-center text-stone-400">
            <ArrowRight className={`w-5 h-5 ${s1 === 'completed' ? 'text-orange-500' : 'text-stone-300'}`} />
          </div>

          {/* Agent 2 */}
          <div className={`border rounded-xl p-5 transition-colors flex flex-col justify-between ${stageStyle(s2)}`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-stone-500">Stage 02</span>
                {renderStatusIcon(s2)}
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldAlert className="w-4 h-4 text-orange-600 shrink-0" />
                <h3 className="text-sm font-bold text-stone-900">Safety &amp; Policy Checker</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                AI reviews consistency; deterministic server-side policy gate enforces all eligibility and safety rules.
              </p>
            </div>
            {result?.agent2Evaluation && (
              <div className="mt-4 pt-3 border-t border-stone-200/80 text-xs space-y-1">
                <div className="font-semibold text-stone-900">
                  Gate Decision: {result.agent2Evaluation.gateResult.decision}
                </div>
                <div className="text-stone-600">
                  {result.agent2Evaluation.gateResult.plainTitle}
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center justify-center text-stone-400">
            <ArrowRight className={`w-5 h-5 ${s2 === 'completed' ? 'text-orange-500' : 'text-stone-300'}`} />
          </div>

          {/* Agent 3 */}
          <div className={`border rounded-xl p-5 transition-colors flex flex-col justify-between ${stageStyle(s3)}`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-stone-500">Stage 03</span>
                {renderStatusIcon(s3)}
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0" />
                <h3 className="text-sm font-bold text-stone-900">Resolution Agent</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Executes simulated refund only when server gate authorizes, or explains rejection / review steps clearly.
              </p>
            </div>
            {result && (
              <div className="mt-4 pt-3 border-t border-stone-200/80 text-xs space-y-1">
                <div className="font-semibold text-stone-900">
                  Tx Status: {result.transactionStatus}
                </div>
                <div className="font-mono text-stone-600 tabular-nums">
                  {result.refundId ? `Ref: ${result.refundId}` : `Refunded: ${formatINR(result.refundedAmount)}`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Real Tool Activity Feed */}
        <div className="mt-6 pt-6 border-t border-stone-200">
          <h3 className="text-sm font-bold text-stone-900 mb-3">Application Tool Activity</h3>
          {toolCalls.length === 0 ? (
            <div className="text-xs text-stone-500 py-6 text-center bg-stone-50 border border-stone-200 rounded-lg">
              No tool calls executed yet. Submit a return request to observe real tool inputs and outputs.
            </div>
          ) : (
            <div className="divide-y divide-stone-200 border border-stone-200 rounded-lg overflow-hidden">
              {toolCalls.map((tc) => (
                <div
                  key={tc.id}
                  className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-stone-900">
                      {tc.tool} <span className="font-normal text-stone-500">· {tc.agent}</span>
                    </div>
                    <div className="text-stone-600 font-mono">
                      Input: {tc.inputSummary} &rarr; Result: {tc.outputSummary}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {tc.attempt > 1 && (
                      <span className="text-stone-500 font-mono">Attempt {tc.attempt}</span>
                    )}
                    <span className={`px-2.5 py-1 border rounded-md font-semibold ${toolBadgeStyle(tc.status)}`}>
                      {tc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section 3: Case Results */}
      {result && (
        <section className="bg-white border border-stone-200 rounded-xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-5 border-b border-stone-200">
            <div>
              <div className="text-xs text-stone-500 font-mono mb-1">
                {result.case_id} · Idempotency Key: {result.idempotencyKey}
              </div>
              <h2 className="text-xl font-bold text-stone-900 tracking-tight">{result.plainTitle}</h2>
              <p className="text-sm text-stone-700 mt-1">{result.plainReason}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border ${
                  result.decision === 'ALLOW' && result.transactionStatus === 'SUCCEEDED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : result.decision === 'NEEDS_REVIEW'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-red-50 text-red-800 border-red-300'
                }`}
              >
                Decision: {result.decision}
              </span>
            </div>
          </div>

          {/* Summary Numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Requested Refund</div>
              <div className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-1">
                {formatINR(result.requestedAmount)}
              </div>
            </div>
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Simulated Refunded</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  result.refundedAmount > 0 ? 'text-emerald-700' : 'text-stone-700'
                }`}
              >
                {formatINR(result.refundedAmount)}
              </div>
            </div>
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Transaction Status</div>
              <div className="text-sm font-bold font-mono text-stone-900 mt-1.5">
                {result.transactionStatus}
              </div>
            </div>
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Further Action</div>
              <div className="text-xs font-medium text-stone-800 mt-1.5">
                {result.furtherActionNeeded}
              </div>
            </div>
          </div>

          {/* Uncertain Outcome Reconciliation Action */}
          {result.canReconcile && result.transactionStatus === 'UNKNOWN_OUTCOME' && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold">Reconciliation Required Before Any Retry</p>
                <p>
                  Because the simulated gateway timed out after request dispatch, ReturnShield AI refuses to trigger a second refund automatically. Check the recorded transaction status first.
                </p>
              </div>
              <button
                type="button"
                disabled={isReconciling}
                onClick={() => onReconcile(result.idempotencyKey, result.case_id)}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isReconciling ? 'Checking Status...' : 'Verify Transaction Status'}
              </button>
            </div>
          )}

          {/* Discrepancy Comparison Table */}
          {result.agent1Findings && result.agent1Findings.discrepancies.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-stone-900 mb-2.5">
                Claim vs Trusted Record Discrepancies
              </h3>
              <div className="overflow-x-auto border border-stone-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-700">
                    <tr>
                      <th className="p-3 font-semibold">Field</th>
                      <th className="p-3 font-semibold">Customer Claim</th>
                      <th className="p-3 font-semibold">Trusted Store Record</th>
                      <th className="p-3 font-semibold">Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {result.agent1Findings.discrepancies.map((d, i) => (
                      <tr key={i}>
                        <td className="p-3 font-semibold text-stone-900">{d.field}</td>
                        <td className="p-3 text-stone-700">{d.customerClaim}</td>
                        <td className="p-3 text-stone-900 font-medium">{d.trustedRecord}</td>
                        <td className="p-3 font-mono font-semibold text-amber-700">{d.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Policy Checks Checklist */}
          {result.agent2Evaluation && (
            <div>
              <h3 className="text-sm font-bold text-stone-900 mb-2.5">Verified Deterministic Policy Checks</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {result.agent2Evaluation.gateResult.checks.map((chk, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-stone-200 rounded-lg bg-stone-50/70 flex items-start gap-2.5 text-xs"
                  >
                    {chk.status === 'PASS' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : chk.status === 'WARN' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-stone-900">{chk.rule}</div>
                      <div className="text-stone-600 mt-0.5">{chk.plainMessage}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer Support Reply */}
          <div>
            <h3 className="text-sm font-bold text-stone-900 mb-2">Drafted Customer Support Reply</h3>
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 whitespace-pre-line leading-relaxed">
              {result.supportReply}
            </div>
          </div>

          {/* Expandable Technical Details */}
          <div className="pt-2 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
            >
              {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showTechnicalDetails ? 'Hide Technical Verification Details' : 'Show Technical Verification Details'}
            </button>
            {showTechnicalDetails && (
              <div className="mt-3 p-4 bg-stone-900 text-stone-200 rounded-lg text-xs font-mono space-y-2 overflow-x-auto">
                <div>Case State: {result.state}</div>
                <div>Model Used: {result.agent1Findings?.modelUsed || 'deterministic-only'}</div>
                <div>AI Recommendation: {result.agent2Evaluation?.aiRecommendation} — {result.agent2Evaluation?.aiReasoning}</div>
                <div>Gate Code: {result.agent2Evaluation?.gateResult.technicalReason}</div>
                {result.agent1Findings?.order && (
                  <div>
                    Trusted Order Dates: Purchased {formatDateDDMMYYYY(result.agent1Findings.order.purchase_date)} · Delivered{' '}
                    {formatDateDDMMYYYY(result.agent1Findings.order.delivery_date)}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
