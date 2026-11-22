import React, { useState } from 'react';
import { AlertCircle, ArrowRight, FileCheck, ShieldAlert, Upload, X } from 'lucide-react';
import type { FormValues } from '../types/returnshield';

interface CustomerReturnFormProps {
  values: FormValues;
  onChange: (next: FormValues) => void;
  onSubmit: (validatedPayload: Record<string, unknown>) => void;
  onOpenDemoCases: () => void;
  isSubmitting: boolean;
  serverErrors?: Record<string, string>;
}

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const CustomerReturnForm: React.FC<CustomerReturnFormProps> = ({
  values,
  onChange,
  onSubmit,
  onOpenDemoCases,
  isSubmitting,
  serverErrors = {},
}) => {
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string>('');

  const errors = { ...clientErrors, ...serverErrors };

  const updateField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    onChange({ ...values, [key]: value });
    if (clientErrors[key]) {
      const next = { ...clientErrors };
      delete next[key];
      setClientErrors(next);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
      setFileError('Only PNG, JPG, WEBP images or PDF files are accepted.');
      e.target.value = '';
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setFileError('Evidence file must be larger than 0 bytes and under 2 MB.');
      e.target.value = '';
      return;
    }

    onChange({
      ...values,
      uploaded_evidence: {
        fileName: file.name,
        mimeType: file.type as NonNullable<FormValues['uploaded_evidence']>['mimeType'],
        sizeBytes: file.size,
      },
    });
  };

  const validateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    const orderNum = values.order_number.trim();
    if (!orderNum) {
      nextErrors.order_number = 'Order number is required.';
    } else if (!/^[A-Za-z0-9-]+$/.test(orderNum) || orderNum.length < 3) {
      nextErrors.order_number = 'Enter a valid order number (letters, numbers, and hyphens only, e.g. ORD-101).';
    }

    if (!values.product_name.trim() || values.product_name.trim().length < 2) {
      nextErrors.product_name = 'Product name is required.';
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (!values.purchase_date) {
      nextErrors.purchase_date = 'Purchase date is required.';
    } else if (values.purchase_date > todayStr) {
      nextErrors.purchase_date = 'Purchase date cannot be in the future.';
    }

    if (!values.delivery_date) {
      nextErrors.delivery_date = 'Delivery date is required.';
    } else if (values.delivery_date > todayStr) {
      nextErrors.delivery_date = 'Delivery date cannot be in the future.';
    } else if (values.purchase_date && values.delivery_date < values.purchase_date) {
      nextErrors.delivery_date = 'Delivery date cannot precede the purchase date.';
    }

    const origAmt = Number(values.original_amount_paid);
    if (!values.original_amount_paid.trim() || isNaN(origAmt) || origAmt <= 0) {
      nextErrors.original_amount_paid = 'Enter a valid original amount paid in INR greater than ₹0.00.';
    }

    const reqAmt = Number(values.requested_refund_amount);
    if (!values.requested_refund_amount.trim() || isNaN(reqAmt) || reqAmt <= 0) {
      nextErrors.requested_refund_amount = 'Enter a valid requested refund amount in INR greater than ₹0.00.';
    }

    const windowDays = Number(values.claimed_return_window_days);
    if (
      !values.claimed_return_window_days.trim() ||
      !Number.isInteger(windowDays) ||
      windowDays <= 0 ||
      windowDays > 365
    ) {
      nextErrors.claimed_return_window_days = 'Return window must be a whole number between 1 and 365 days.';
    }

    if (!values.claimed_policy_description.trim() || values.claimed_policy_description.trim().length < 5) {
      nextErrors.claimed_policy_description = 'Return policy description is required (minimum 5 characters).';
    }

    if (!values.product_condition.trim() || values.product_condition.trim().length < 3) {
      nextErrors.product_condition = 'Product condition and requirements are required.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setClientErrors(nextErrors);
      return;
    }

    setClientErrors({});
    onSubmit({
      order_number: orderNum.toUpperCase(),
      product_name: values.product_name.trim(),
      purchase_date: values.purchase_date,
      delivery_date: values.delivery_date,
      original_amount_paid: origAmt,
      requested_refund_amount: reqAmt,
      currency: 'INR',
      reason_for_return: values.reason_for_return,
      reason_details: values.reason_details.trim(),
      claimed_return_window_days: windowDays,
      claimed_policy_description: values.claimed_policy_description.trim(),
      product_condition: values.product_condition.trim(),
      evidence_availability: values.evidence_availability,
      uploaded_evidence: values.uploaded_evidence,
      idempotency_key: values.idempotency_key?.trim() || undefined,
      fault_simulation: values.fault_simulation,
    });
  };

  return (
    <section className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">Customer Return Request</h2>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Enter your order and return claim details below. All submitted values are treated as an unverified claim and will be checked against trusted order records and verified store policies before any simulated refund is authorized.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenDemoCases}
          className="px-4 py-2 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors whitespace-nowrap shrink-0"
        >
          Load a Demo Order
        </button>
      </div>

      {Object.keys(errors).length > 0 && (
        <div
          role="alert"
          className="mt-5 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-sm text-red-800"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Please fix the form errors below before submitting.</p>
            <p className="text-xs text-red-700 mt-0.5">
              The investigation workflow will not start until all required fields contain valid values.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={validateAndSubmit} noValidate className="mt-6 space-y-6">
        {/* Order & Product Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="order_number" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Order Number *
            </label>
            <input
              id="order_number"
              type="text"
              value={values.order_number}
              onChange={(e) => updateField('order_number', e.target.value)}
              placeholder="e.g. ORD-101"
              className={`w-full px-3.5 py-2.5 text-sm font-mono bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.order_number ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
              }`}
            />
            {errors.order_number && <p className="text-xs text-red-600 mt-1">{errors.order_number}</p>}
          </div>

          <div>
            <label htmlFor="product_name" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Product Name *
            </label>
            <input
              id="product_name"
              type="text"
              value={values.product_name}
              onChange={(e) => updateField('product_name', e.target.value)}
              placeholder="Enter exact product name"
              className={`w-full px-3.5 py-2.5 text-sm bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.product_name ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
              }`}
            />
            {errors.product_name && <p className="text-xs text-red-600 mt-1">{errors.product_name}</p>}
          </div>

          <div>
            <label htmlFor="purchase_date" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Purchase Date *
            </label>
            <input
              id="purchase_date"
              type="date"
              value={values.purchase_date}
              onChange={(e) => updateField('purchase_date', e.target.value)}
              className={`w-full px-3.5 py-2.5 text-sm font-mono bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.purchase_date ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
              }`}
            />
            {errors.purchase_date && <p className="text-xs text-red-600 mt-1">{errors.purchase_date}</p>}
          </div>

          <div>
            <label htmlFor="delivery_date" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Delivery Date *
            </label>
            <input
              id="delivery_date"
              type="date"
              value={values.delivery_date}
              onChange={(e) => updateField('delivery_date', e.target.value)}
              className={`w-full px-3.5 py-2.5 text-sm font-mono bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.delivery_date ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
              }`}
            />
            {errors.delivery_date && <p className="text-xs text-red-600 mt-1">{errors.delivery_date}</p>}
          </div>

          <div>
            <label htmlFor="original_amount_paid" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Original Amount Paid (INR ₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-mono text-stone-500">₹</span>
              <input
                id="original_amount_paid"
                type="number"
                step="0.01"
                min="0"
                value={values.original_amount_paid}
                onChange={(e) => updateField('original_amount_paid', e.target.value)}
                placeholder="1499.00"
                className={`w-full pl-8 pr-3.5 py-2.5 text-sm font-mono tabular-nums bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  errors.original_amount_paid ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
            </div>
            {errors.original_amount_paid && (
              <p className="text-xs text-red-600 mt-1">{errors.original_amount_paid}</p>
            )}
          </div>

          <div>
            <label htmlFor="requested_refund_amount" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Requested Refund Amount (INR ₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-mono text-stone-500">₹</span>
              <input
                id="requested_refund_amount"
                type="number"
                step="0.01"
                min="0"
                value={values.requested_refund_amount}
                onChange={(e) => updateField('requested_refund_amount', e.target.value)}
                placeholder="1499.00"
                className={`w-full pl-8 pr-3.5 py-2.5 text-sm font-mono tabular-nums bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  errors.requested_refund_amount ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
            </div>
            {errors.requested_refund_amount && (
              <p className="text-xs text-red-600 mt-1">{errors.requested_refund_amount}</p>
            )}
          </div>
        </div>

        {/* Return Reason & Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-stone-200">
          <div>
            <label htmlFor="reason_for_return" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Reason for Return *
            </label>
            <select
              id="reason_for_return"
              value={values.reason_for_return}
              onChange={(e) =>
                updateField('reason_for_return', e.target.value as FormValues['reason_for_return'])
              }
              className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="Damaged product">Damaged product</option>
              <option value="Wrong item delivered">Wrong item delivered</option>
              <option value="Product not as described">Product not as described</option>
              <option value="Changed my mind">Changed my mind</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="evidence_availability" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Evidence Availability *
            </label>
            <select
              id="evidence_availability"
              value={values.evidence_availability}
              onChange={(e) =>
                updateField('evidence_availability', e.target.value as FormValues['evidence_availability'])
              }
              className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="Available">Available</option>
              <option value="Not available">Not available</option>
              <option value="Not required by policy">Not required by policy</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="reason_details" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Customer Explanation / Notes (Optional)
            </label>
            <textarea
              id="reason_details"
              rows={2}
              value={values.reason_details}
              onChange={(e) => updateField('reason_details', e.target.value)}
              placeholder="Describe the issue with your order..."
              className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Customer-Entered Policy Claim (Untrusted) */}
        <div className="pt-4 border-t border-stone-200 space-y-4">
          <div className="flex items-start gap-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Customer-entered policy text below is checked for discrepancies against the store&apos;s verified policy and is never treated as permission to authorize a refund.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label htmlFor="claimed_return_window_days" className="block text-xs font-semibold text-stone-800 mb-1.5">
                Return Window (Days) *
              </label>
              <input
                id="claimed_return_window_days"
                type="number"
                min="1"
                max="365"
                value={values.claimed_return_window_days}
                onChange={(e) => updateField('claimed_return_window_days', e.target.value)}
                className={`w-full px-3.5 py-2.5 text-sm font-mono bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  errors.claimed_return_window_days ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {errors.claimed_return_window_days && (
                <p className="text-xs text-red-600 mt-1">{errors.claimed_return_window_days}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="claimed_policy_description" className="block text-xs font-semibold text-stone-800 mb-1.5">
                Return Policy Description *
              </label>
              <input
                id="claimed_policy_description"
                type="text"
                value={values.claimed_policy_description}
                onChange={(e) => updateField('claimed_policy_description', e.target.value)}
                className={`w-full px-3.5 py-2.5 text-sm bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  errors.claimed_policy_description ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {errors.claimed_policy_description && (
                <p className="text-xs text-red-600 mt-1">{errors.claimed_policy_description}</p>
              )}
            </div>

            <div className="md:col-span-3">
              <label htmlFor="product_condition" className="block text-xs font-semibold text-stone-800 mb-1.5">
                Product Condition &amp; Return Requirements *
              </label>
              <input
                id="product_condition"
                type="text"
                value={values.product_condition}
                onChange={(e) => updateField('product_condition', e.target.value)}
                className={`w-full px-3.5 py-2.5 text-sm bg-stone-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  errors.product_condition ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {errors.product_condition && (
                <p className="text-xs text-red-600 mt-1">{errors.product_condition}</p>
              )}
            </div>
          </div>
        </div>

        {/* Optional Evidence Upload & Demo Fault Simulation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-stone-200">
          <div>
            <label htmlFor="evidence_upload" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Optional Evidence File (PNG, JPG, WEBP, PDF · Max 2 MB)
            </label>
            <div className="flex items-center gap-3">
              <label
                htmlFor="evidence_upload"
                className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-stone-700 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Attach File
              </label>
              <input
                id="evidence_upload"
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                onChange={handleFileChange}
                className="sr-only"
              />
              {values.uploaded_evidence ? (
                <div className="flex items-center gap-2 text-xs text-stone-700 bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-lg">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="truncate max-w-[160px] font-mono">{values.uploaded_evidence.fileName}</span>
                  <button
                    type="button"
                    aria-label="Remove uploaded file"
                    onClick={() => updateField('uploaded_evidence', undefined)}
                    className="text-stone-400 hover:text-stone-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-stone-500">No file selected</span>
              )}
            </div>
            {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
            {values.uploaded_evidence && (
              <p className="text-xs text-stone-500 mt-1">
                Metadata recorded ({Math.round(values.uploaded_evidence.sizeBytes / 1024)} KB) — not treated as proof without review.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="fault_simulation" className="block text-xs font-semibold text-stone-800 mb-1.5">
              Failure / Recovery Mode (Demo Testing Only)
            </label>
            <select
              id="fault_simulation"
              value={values.fault_simulation}
              onChange={(e) =>
                updateField('fault_simulation', e.target.value as FormValues['fault_simulation'])
              }
              className="w-full px-3.5 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="none">None (Normal execution)</option>
              <option value="transient_read_failure">Transient read failure (recovers on safe retry)</option>
              <option value="lookup_timeout">Order lookup timeout (fails safely)</option>
              <option value="malformed_tool_output">Malformed tool response (rejected by schema)</option>
              <option value="malformed_model_output">Malformed AI output (fails closed to review)</option>
              <option value="refund_uncertain_timeout">Refund gateway timeout (UNKNOWN_OUTCOME)</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-xs text-stone-500">
            Simulated environment only. No real bank or UPI payment will occur.
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isSubmitting ? 'Investigating Request...' : 'Submit Return Request'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </section>
  );
};
