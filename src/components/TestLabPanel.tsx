import React, { useState } from 'react';
import { CheckCircle2, Play, RefreshCw, XCircle } from 'lucide-react';
import { formatINR, type TestLabReport } from '../types/returnshield';

interface TestLabPanelProps {
  report: TestLabReport | null;
  isRunning: boolean;
  onRunTests: () => void;
}

export const TestLabPanel: React.FC<TestLabPanelProps> = ({ report, isRunning, onRunTests }) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const categories = report
    ? ['All', ...Array.from(new Set(report.tests.map((t) => t.category)))]
    : ['All'];

  const filteredTests = report
    ? report.tests.filter((t) => categoryFilter === 'All' || t.category === categoryFilter)
    : [];

  return (
    <section className="bg-white border border-stone-200 rounded-xl p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">Automated Test Lab</h2>
          <p className="text-sm text-stone-600 mt-0.5">
            Executes 20 real assertions against isolated demo fixtures—covering eligibility, prompt injection, idempotency, concurrency, tool failures, and reconciliation.
          </p>
        </div>

        <button
          type="button"
          onClick={onRunTests}
          disabled={isRunning}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running 20 Tests...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Run All 20 Tests
            </>
          )}
        </button>
      </div>

      {!report ? (
        <div className="py-12 text-center bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-600">
          Click <strong>Run All 20 Tests</strong> to execute live assertions against the backend tools and policy gate.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Disclaimer */}
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>{report.disclaimer}</span>
            <span className="font-mono text-stone-500 shrink-0">
              Executed at {new Date(report.executedAt).toLocaleTimeString('en-IN')}
            </span>
          </div>

          {/* Calculated Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Tests Executed</div>
              <div className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-1">
                {report.summary.totalExecuted}
              </div>
            </div>
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
              <div className="text-xs text-emerald-800">Passed / Failed</div>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-800 mt-1">
                {report.summary.passed} / {report.summary.failed}
              </div>
            </div>
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Demo Suite Pass Rate</div>
              <div className="text-lg font-bold font-mono tabular-nums text-orange-700 mt-1">
                {report.summary.passRate}
              </div>
            </div>
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Unsafe Actions Blocked</div>
              <div className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-1">
                {report.summary.unsafeActionsBlocked}
              </div>
            </div>
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Tool Recoveries</div>
              <div className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-1">
                {report.summary.recoveriesSucceeded}/{report.summary.toolFailuresInjected}
              </div>
            </div>
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">Simulated INR Total</div>
              <div className="text-base font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                {formatINR(report.summary.confirmedSimulatedInrRefunded)}
              </div>
            </div>
          </div>

          <div className="text-xs text-stone-600">
            Legitimate requests incorrectly blocked in this suite run:{' '}
            <strong className="font-mono text-stone-900">
              {report.summary.legitimateIncorrectlyBlocked}
            </strong>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-stone-100 rounded-lg w-fit">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto border border-stone-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-700">
                <tr>
                  <th className="p-3 font-semibold">#</th>
                  <th className="p-3 font-semibold">Test Scenario &amp; Input</th>
                  <th className="p-3 font-semibold">Expected Outcome</th>
                  <th className="p-3 font-semibold">Actual Outcome</th>
                  <th className="p-3 font-semibold whitespace-nowrap">Refund Tool</th>
                  <th className="p-3 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredTests.map((t) => (
                  <tr key={t.id} className="hover:bg-stone-50/70 align-top">
                    <td className="p-3 font-mono font-semibold text-stone-600">{t.id}</td>
                    <td className="p-3 space-y-1 max-w-xs">
                      <div className="font-semibold text-stone-900">{t.name}</div>
                      <div className="text-stone-500">{t.category}</div>
                      <div className="font-mono text-[11px] text-stone-600">{t.inputSummary}</div>
                    </td>
                    <td className="p-3 text-stone-700 max-w-[210px]">{t.expected}</td>
                    <td className="p-3 space-y-1 max-w-[230px]">
                      <div className="font-mono text-stone-900">{t.actual}</div>
                      <div className="text-stone-500">{t.eventOrError}</div>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-stone-700 whitespace-nowrap">
                      <div>Attempted: {t.refundAttempted ? 'Yes' : 'No'}</div>
                      <div>Authorized: {t.refundAuthorized ? 'Yes' : 'No'}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {t.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-4 h-4" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                          <XCircle className="w-4 h-4" /> FAIL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
