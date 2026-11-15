# Assignment 002 audit

Base: main `e7ae3af` (PR #5). No separate Assignment 002 issue/document was found; the user request, implementation charter and one-button build contract govern this work.

Existing reusable components: family-scoped signed sessions and Origin/CSRF checks; acknowledged/idempotent jobs; transactional budget reservations; immutable revisions, keep/undo/fork; signed private preview capabilities; sandboxed iframe UI; local durable revision DAG and unchanged v1 progress key; desktop/mobile regression suite.

Blocking gaps in the previous foundation: production adapters always unavailable; only a fixed declarative star game accepted; no model transport, generated source compiler, repair loop, deployable browser gate, application server/dispatcher or cloud persistence adapter. Runtime build tests used an injected fixture gate. Remote UI assumed every game caught stars. File persistence lacked a process lock. Queued work was dispatched only opportunistically in the HTTP handler. No live-provider or container evidence was claimed.

Plan: add an explicitly approved, server-only metered OpenAI Responses adapter; generated TypeScript module contract; bounded compile/test/repair; credential-free gVisor worker; source-bound compiled artifacts; private CSP preview reuse; durable dispatcher and owner-configured persistence/runtime. Preserve all old declarative and local game paths. Paid activation remains disabled until the account owner supplies verified provider/model/rates/budget, identity and infrastructure.
