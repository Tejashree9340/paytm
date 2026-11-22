# ReturnShield AI

ReturnShield AI is an AI-assisted e-commerce refund investigation and safety verification web application built with React, TypeScript, Express, Vite, Tailwind CSS, Zod, and the `@google/genai` SDK (`gemini-4-hydrogen`).

> **Demo Environment Notice:** All orders, refund executions, and transactions in this application are simulated using demo data (`INR` / `₹`). No real payments, UPI transfers, or bank refunds are performed.

---

## Key Capabilities

1. **Customer Return Request Form (`/src/components/CustomerReturnForm.tsx`)**
   - Collects order number, product name, purchase date, delivery date, original amount paid (`INR`), requested refund amount (`INR`), return reason, customer-entered policy details, product condition, evidence availability, and optional attachment metadata (`PNG`, `JPG`, `WEBP`, `PDF` up to `2 MB`).
   - Enforces client-side and server-side Zod validation before any investigation starts (`delivery_date >= purchase_date`, no future dates, positive monetary amounts, valid formats).
   - Treats all customer-entered policy text and order notes as untrusted claims rather than authorization.

2. **Three-Agent Workflow (`/server/agents.ts`)**
   - **Agent 1 — Order Investigator:** Calls `lookup_order`, `get_return_policy`, and `get_refund_history`, compares customer claims against trusted store records, and reports discrepancies.
   - **Agent 2 — Safety & Policy Checker:** Uses `gemini-4-hydrogen` (with structured JSON schema validation) alongside a binding **Deterministic Policy Gate** (`/server/policyGate.ts`).
   - **Agent 3 — Resolution Agent:** Invokes `execute_simulated_refund` only when authorized by the server-side gate, handles uncertain timeouts (`UNKNOWN_OUTCOME`) without blind retries, supports manual status reconciliation (`reconcile_unknown_transaction`), and drafts plain-English customer replies (`create_support_reply`).

3. **Deterministic Server-Side Security Gate (`/server/policyGate.ts` & `/server/tools.ts`)**
   - Verifies order existence, currency matching (`INR` without silent conversion), remaining refundable balance, trusted return window, damage evidence requirements, prompt-injection patterns, concurrency locks (`inFlightLocks`), and idempotency keys.
   - Mints a single-use server authorization token only on `ALLOW`; `execute_simulated_refund` rejects calls without a valid token.
   - Retries only safe read operations (`lookup_order`, `get_return_policy`, `get_refund_history`) up to 2 times on transient failures.

4. **Live Agent Workflow, Case Results & Audit Trail**
   - Streams real-time state transitions (`RECEIVED`, `VALIDATING`, `INVESTIGATING`, `BLOCKED`, `NEEDS_REVIEW`, `READY_FOR_ACTION`, `EXECUTING`, `SUCCEEDED`, `FAILED`, `UNKNOWN_OUTCOME`) and tool execution traces over Server-Sent Events (`/api/cases/investigate-stream`).
   - Records a sanitized chronological audit trail (`/src/components/AuditTrailPanel.tsx`) without logging API keys or secrets.

5. **Demo Cases & Automated Test Lab (`/server/testLab.ts`)**
   - Includes prepared Indian e-commerce demo orders (`ORD-101` through `ORD-106`) covering eligible refunds, expired return windows, already-refunded orders, partial refunds, EUR currency mismatch, and missing store policies.
   - Runs **20 automated assertions** against isolated in-memory test stores (`createSeededStore(true)`), reporting real pass/fail counts, blocked unsafe actions, tool failure recoveries, and simulated INR totals.

---

## Project Structure

```text
├── api/
│   └── index.ts                 # Vercel Serverless Function entrypoint
├── server/
│   ├── agents.ts                # 3-stage agent workflow + SSE event emission
│   ├── app.ts                   # Reusable Express API router
│   ├── policyGate.ts            # Deterministic server-side authorization gate
│   ├── store.ts                 # Seeded INR demo data + /tmp JSON persistence
│   ├── testLab.ts               # 20 automated edge-case tests on isolated stores
│   ├── tools.ts                 # Validated tools, timeouts, retries, reconciliation
│   └── types.ts                 # Case states, Zod schemas, INR/date formatters
├── src/
│   ├── components/
│   │   ├── AuditTrailPanel.tsx
│   │   ├── CustomerReturnForm.tsx
│   │   ├── DemoCasesPanel.tsx
│   │   ├── LiveAgentWorkflow.tsx
│   │   └── TestLabPanel.tsx
│   ├── types/returnshield.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── server.ts                    # Express + Vite dev/prod server entrypoint
├── vercel.json                  # Vercel build & rewrite configuration
└── package.json
```

---

## Local Development

### Prerequisites
- Node.js `>= 20`
- A Gemini API key (`GEMINI_API_KEY`)

### Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables (copy `.env.example` to `.env` and set your key):
   ```env
   GEMINI_API_KEY="your_gemini_api_key"
   ```
3. Start the development server on port `3000`:
   ```bash
   npm run dev
   ```
4. Type-check and build for production:
   ```bash
   npm run lint
   npm run build
   ```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/cases/investigate` | Validates a return request and runs the full investigation workflow |
| `POST` | `/api/cases/investigate-stream` | Streams live workflow states, tool traces, and audit events via SSE |
| `POST` | `/api/cases/reconcile` | Checks transaction status and reconciles `UNKNOWN_OUTCOME` cases |
| `GET` | `/api/demo/data` | Returns current demo orders, policies, refund history, and audit logs |
| `POST` | `/api/demo/reset` | Resets demo data back to initial seeded orders |
| `POST` | `/api/tests/run` | Executes the 20-scenario Test Lab suite against isolated fixtures |
| `GET` | `/api/health` | Health check endpoint |

---

## Deploying to Vercel

This repository includes `vercel.json` and `api/index.ts` for Vercel deployment:

1. Push the project to GitHub, GitLab, or Bitbucket (or deploy with `npx vercel`).
2. Import the repository in the Vercel dashboard.
3. Add `GEMINI_API_KEY` in **Project Settings → Environment Variables**.
4. Deploy.

> **Persistence Limitation:** Demo state is persisted in `/tmp/returnshield-demo-store.json` and in-memory state. On serverless platforms like Vercel, `/tmp` and memory reset on cold starts and are not shared across concurrent function instances. For multi-user production persistence, replace `server/store.ts` with an external database.
