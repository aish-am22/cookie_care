# Backend

Express + TypeScript backend for Cookie Care.

## Running locally

```bash
npm install
npm run build
npm start
```

Set the required environment variables (see `.env.example`) before starting.

---

## `src/` directory structure

```
src/
├── config/          # Typed environment parsing and application config
├── controllers/     # Thin request/response handlers — call services, return JSON
├── infra/           # Cross-cutting infrastructure (logger, etc.)
├── middlewares/     # Express middleware (requestId, errorHandler, rateLimit, validate, cors)
├── routes/          # Express Router definitions — URL paths wired to controllers
├── schemas/         # Zod validation schemas for request bodies / query params
├── services/        # Business logic, organised by feature domain
│   ├── ai/          # Gemini client, AI queue, prompt templates
│   ├── chat/        # DPA assistant / conversational AI
│   ├── contracts/   # Contract generation
│   ├── email/       # Nodemailer transports and email-report logic
│   ├── legal/       # Legal document review
│   ├── redaction/   # PII detection and document redaction
│   ├── scan/        # Cookie / tracker / compliance scan orchestration
│   ├── templates/   # Contract template CRUD (active)
│   └── vulnerability/ # Passive vulnerability scanner
├── types/           # Global TypeScript ambient declarations (express.d.ts)
└── utils/           # Stateless helpers (errors, urls, json)
```

---

## Migration plan

The project uses a **Strangler Fig** approach: `backend/server.ts` remains the
running entrypoint while logic is incrementally migrated into `src/`.

### Completed
- `src/services/templates/` — template CRUD fully migrated
- `src/routes/templates.routes.ts` and `src/controllers/templates.controller.ts`

### Next steps (recommended order)

| Priority | Endpoint(s) | Target service | Notes |
|----------|-------------|----------------|-------|
| 1 | `POST /api/email-report` | `services/email/` | Low complexity, no browser |
| 2 | `POST /api/scan-vulnerabilities` | `services/vulnerability/` | Single AI call |
| 3 | `POST /api/generate-contract` | `services/contracts/` | Single AI call |
| 4 | `POST /api/legal-review` | `services/legal/` | Single AI call |
| 5 | `POST /api/find-pii` + `POST /api/redact-document` | `services/redaction/` | File handling |
| 6 | `POST /api/scan` | `services/scan/` + `services/ai/` | Largest; browser + AI queue |
| 7 | `POST /api/chat` | `services/chat/` | SSE stream |

### Rules for each migration step
1. **Move code, don't change it** — functionality stays identical.
2. Export the new service from `src/services/<feature>/index.ts`.
3. Add the controller in `src/controllers/<feature>.controller.ts`.
4. Wire the router in `src/routes/<feature>.routes.ts`.
5. Mount the router in `src/routes/index.ts` (replace the placeholder comment).
6. Remove the corresponding handler from `backend/server.ts`.
7. Verify `npm run build` passes and the endpoint still works.
