import React from 'react';
import { Clock } from 'lucide-react';
import type { AuditLogEntry } from '../types/returnshield';

interface AuditTrailPanelProps {
  entries: AuditLogEntry[];
}

export const AuditTrailPanel: React.FC<AuditTrailPanelProps> = ({ entries }) => {
  return (
    <section className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-5 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">Audit Trail</h2>
          <p className="text-sm text-stone-600 mt-0.5">
            Chronological log of intake validations, tool executions, policy gate decisions, blocked actions, and state transitions. Secrets and API keys are never logged.
          </p>
        </div>
        <span className="text-xs font-mono text-stone-500 tabular-nums shrink-0">
          {entries.length} recorded event{entries.length === 1 ? '' : 's'}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="mt-6 py-12 text-center bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-500">
          <Clock className="w-6 h-6 text-stone-400 mx-auto mb-2" />
          No audit events recorded yet. Submit a return request to generate an audit trail.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-stone-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-700">
              <tr>
                <th className="p-3 font-semibold whitespace-nowrap">Time</th>
                <th className="p-3 font-semibold whitespace-nowrap">Case ID</th>
                <th className="p-3 font-semibold whitespace-nowrap">Stage</th>
                <th className="p-3 font-semibold whitespace-nowrap">Actor</th>
                <th className="p-3 font-semibold">Event Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-stone-50/70">
                  <td className="p-3 font-mono tabular-nums text-stone-500 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString('en-IN')}
                  </td>
                  <td className="p-3 font-mono text-stone-800 whitespace-nowrap">{entry.case_id}</td>
                  <td className="p-3 font-mono font-semibold text-stone-900 whitespace-nowrap">
                    {entry.stage}
                  </td>
                  <td className="p-3 text-stone-700 whitespace-nowrap">{entry.actor}</td>
                  <td className="p-3 text-stone-800">
                    <div>{entry.message}</div>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <div className="mt-1 font-mono text-[11px] text-stone-500 break-all">
                        {JSON.stringify(entry.details)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
