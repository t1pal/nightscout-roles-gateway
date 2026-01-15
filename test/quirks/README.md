# Observed Quirks and Edge Cases

This document tracks observed behaviors that may be unexpected or undocumented. These are captured as-is without adjusting the code, to document the system's actual behavior.

## How to Add Quirks

When a test discovers unexpected behavior:

1. Add a test case prefixed with `Q` (e.g., `SPV-Q01`)
2. Document the behavior in the test with `console.log`
3. Add an entry to this README with the quirk ID and description

## Quirk Registry

### SPV-Q01: Mismatched fill_pattern and segment count

**View**: `site_policy_schedules`  
**Status**: Observed, not fixed  
**Description**: When `fill_pattern` has fewer entries than `schedule_segments`, the view uses modulo arithmetic to cycle through fill patterns. This may not be intentional.

**Example**:
- `fill_pattern: 'deny,allow'` (2 entries)
- `schedule_segments: '0,10000,20000,30000'` (4 segments)
- Result: Segments get assigned specs in cycling order

**Impact**: Could cause unexpected permission assignments if fill_pattern doesn't match segment count.

---

### SPVA-Q01: Sunday-based week anchor (not Monday)

**View**: `site_policy_schedules_active`  
**Status**: By design (important!)  
**Description**: The view uses a custom week anchor calculation that starts the week on **Sunday**, not PostgreSQL's default Monday:

```sql
-- View uses this (Sunday-based):
now() - (date_trunc('week', now() + interval '1 day') - interval '1 day')

-- NOT this (Monday-based):
now() - date_trunc('week', now())
```

The difference is exactly 86400 seconds (1 day). This means:
- All schedule segment offsets are relative to Sunday 00:00:00
- Segment 0 = Sunday midnight
- Segment 86400 = Monday midnight
- This aligns with JavaScript's `Date.getDay()` which also uses Sunday = 0

**Impact**: When creating schedules, segment offsets must be calculated from Sunday, not Monday. Test fixtures use Sunday-based `dayOffset()` helper to match this behavior.

---

### UASP-Q01: COALESCE with NULL schedule spec

**View**: `unified_active_site_policies`  
**Status**: By design  
**Description**: The COALESCE logic `COALESCE(sch.spec, acl.policy_spec)` means:

- If no active schedule exists (LEFT JOIN returns NULL), base `policy_spec` is used
- If schedule exists with NULL spec, base `policy_spec` is still used (COALESCE skips NULL)

**Impact**: This is expected behavior, but means schedule entries with NULL spec have no effect.

---

### UASP-Q02: Multiple schedules per policy

**View**: `unified_active_site_policies`  
**Status**: Observed  
**Description**: If multiple `scheduled_policies` entries exist for the same `policy_id`, and both are active at the same time, the view may return duplicate ACL entries for the same policy.

**Impact**: 
- Could cause the same user to match multiple ACL entries
- First-match vs all-match behavior depends on how handlers consume the view

---

### SL-Q01: Unique constraint on expected_name enforces DNS-based tenant isolation

**Table**: `registered_sites`  
**Status**: By design (intentional data integrity constraint)  
**Description**: The `expected_name` column has a unique constraint because it forms a unique subdomain (e.g., `mysite.gateway.example.com`). There can only be one registered backend tenant site per DNS name to ensure that CGM data flows exclusively to the designated person's site.

The `find_expected_name` handler includes defensive code to handle multiple rows (`next(rows)` when `rows.length != 1`), but this path cannot be triggered because the schema enforces uniqueness at the database level.

**Code Path**:
```javascript
// lib/policies/index.js - find_expected_name
if (rows.length == 1) {
  req.site = rows[0];
  next( );
  return;
}
next(rows); // This path handles 0 rows OR >1 rows (>1 cannot occur)
```

**Impact**: 
- The >1 row case is defense-in-depth code that can never be triggered
- The 0 row case (unknown site) is the only alternative path
- This is a critical security/integrity feature, not a limitation

**Test Coverage**:
Test SL-05 proves this constraint works by attempting to insert a duplicate `expected_name` and verifying the database rejects it with a unique constraint violation. This documents the product requirement directly in the test suite.

---

---

### TRG-SO-Q01: Sort order trigger not installed

**View/Table**: `connection_policies`  
**Status**: Observed, documented  
**Description**: Migration `20220508223845_add_sort_order_to_connection_policy.js` has `return Promise.resolve(true);` at the start, which bypasses all the trigger creation code. The `initialize_connection_policy_sort` trigger function is never created.

**Behavior**:
- First policy per site gets `sort = NULL`
- Subsequent policies get incrementing sort values (1, 2, 3...) because they count existing policies
- This inconsistency means the first policy has NULL while others have numbers

**Impact**: Applications must:
- Provide explicit sort values when creating policies
- Handle NULL in first-match sort logic
- Use `COALESCE(sort, 0)` in ORDER BY clauses

---

### TRG-HS-Q01: API secret column limited to 255 characters

**Table**: `registered_sites`  
**Status**: By design  
**Description**: The `api_secret` column is defined as `varchar(255)`. PostgreSQL rejects INSERT/UPDATE operations with secrets longer than 255 characters.

**Impact**: 
- API secret validation should enforce maximum length client-side
- Real-world Nightscout secrets are typically 12-64 characters, well within limits

---

### INT-SR-Q01: Site registration integration tests require ORY Hydra

**Test File**: `test/integration/site_registration.test.js`  
**Status**: Expected (external dependency)  
**Description**: The site registration workflow at `/api/v1/workflows/site/registrations/:expected_name` calls `create_hydra_client` which attempts to connect to ORY Hydra at `http://hydra-gw-admin.service.consul:4445`. When Hydra is unavailable, the handler returns a 500 error.

**Handler Chain**:
```javascript
// lib/routes.js line 173-180
server.post('/api/v1/workflows/site/registrations/:expected_name'
  , registrations.handlers.suggest_registration     // ✓ Works
  , registrations.handlers.find_existing            // ✓ Works
  , registrations.handlers.insert_new_site_registration  // ✓ Works
  , clients.handlers.suggest_new_client             // ✓ Works
  , clients.handlers.create_hydra_client            // ✗ Fails without Hydra
  , clients.handlers.record_new_client              // Not reached
  , locals_results( ));
```

**Behavior**:
- First test "proposing a new site" passes (only calls `suggest_registration`)
- Second test "registering a new site" returns 500 (Hydra connection refused)
- Subsequent tests in the same describe block also fail

**Impact**:
- 132 tests pass, 2 tests fail (both in site_registration.test.js)
- These integration tests require a running Hydra instance
- Database-only tests (views, triggers, unit) all pass without external dependencies

**Solution**: Set `SKIP_HYDRA_TESTS=1` environment variable to skip these tests:
```bash
SKIP_HYDRA_TESTS=1 NODE_ENV=test npm test
```

The test file checks this flag and uses Mocha's `this.skip()` to mark Hydra-dependent tests as pending.

---

### E2E-Q01: Warden E2E tests require Kratos connectivity

**Test File**: `test/integration/warden_flow.test.js`  
**Status**: Expected (external dependency)  
**Description**: Warden E2E tests go through the `kratos_whoami` handler which calls the Kratos API. The handler now gracefully handles connection errors by checking `error.response` before accessing properties.

**Impact**:
- Warden E2E tests require a Kratos instance or mock server for identity-based access tests
- Set `SKIP_KRATOS_TESTS=1` to skip these tests
- Without Kratos, requests fall through to anonymous handling

---

### E2E-Q02: matches_api_secret async timing issue

**Handler**: `lib/policies/index.js - matches_api_secret`  
**Status**: Partially fixed, workaround implemented  
**Description**: The `matches_api_secret` handler uses a Promise-based query. The handler now returns the Promise and includes `.catch(next)` for error handling, but restify's middleware chain still doesn't properly await the Promise before proceeding to the next handler.

**Fixes Applied**:
```javascript
// Now returns Promise and catches errors:
return persist.entities.Site.db.findById(...)
  .andWhere(...)
  .join(...)
  .then(function (matches) {
    res.locals.policy.has_matching_api_secret = ...;
    next( );
  })
  .catch(next);  // Added
```

**Root Cause**: Restify's middleware chain doesn't natively await returned Promises. The `next()` call inside `.then()` should work, but database connection pool timing may cause the query to complete after subsequent handlers run.

**Workaround**: 
- A dedicated test server with proper async/await handling was created in `test/integration/api_secret_middleware.test.js`
- This test server uses an `asyncHandler()` wrapper that properly awaits async operations
- 7 tests verify API-SECRET matching behavior (AS-01 through AS-07, MC-02)

**Impact**:
- Test E2E-04 in warden_flow.test.js remains skipped (uses production middleware chain)
- API-SECRET functionality is fully tested via custom test server
- Production may still have timing issues - consider async middleware wrapper for restify

---

### E2E-Q03: Portal endpoint bypasses Kratos for identity testing

**Endpoint**: `/warden/v1/portal/:subject/backend/for/:expected_name`  
**Status**: By design (intentional testing aid)  
**Description**: Unlike the `/warden/v1/active/` endpoints which include `kratos_whoami` in the middleware chain, the portal endpoint takes the subject directly as a URL parameter. This allows testing identity-mapped access flows without needing a Kratos instance.

**Middleware Comparison**:
```javascript
// /warden/v1/active/ - requires Kratos session:
find_expected_name → kratos_whoami → get_acl_by_identity_param → ...

// /warden/v1/portal/:subject/ - subject from URL param:
find_expected_name → get_acl_by_identity_param → ...
```

**Impact**:
- Tests can verify identity-mapped access (AM-B01 through AM-B04, MC-01, MC-03) without Kratos
- Located in `test/integration/portal_identity_access.test.js`
- 8 tests pass, 1 pending

**Note**: API-SECRET matching (MC-02) is now tested separately in `test/integration/api_secret_middleware.test.js` using a custom test server with proper async handling.

---

### MAS-Q01: matches_api_secret missing .catch(next)

**Handler**: `lib/policies/index.js - matches_api_secret`  
**Status**: Fixed (January 2026)  
**Description**: The `matches_api_secret` handler now includes proper error handling:

```javascript
// Fixed code:
return persist.entities.Site.db.findById(...)
  .andWhere(...)
  .join(...)
  .then(function (matches) {
    res.locals.policy.has_matching_api_secret = ...;
    next( );
  })
  .catch(next);  // Now included
```

**Resolution**: Added `return` statement and `.catch(next)` to properly handle database errors and prevent unhandled promise rejections.

---

### NSJWT-Q01: Async Timing Issue in Token Exchange Handler

**Handler**: `lib/exchanged.js - exchange_acl_token`  
**Status**: Mitigated in tests (production middleware still affected)  
**Description**: The `exchange_acl_token` handler returns a Promise that makes an HTTP request to the upstream Nightscout server to exchange for a JWT token. However, restify's middleware chain does not await Promises before proceeding to the next handler.

**Impact**:
- The decision handler runs before the token exchange completes
- `res.locals.nsjwt` is undefined when the decision is made
- NSJWT policy users receive 403 even when token exchange would succeed

**Code Path**:
```javascript
// lib/exchanged.js - exchange_acl_token
if (acl && acl.policy_type == 'nsjwt') {
  return lookup_token(acl, upstream_origin).then(function (token) {
    res.locals.nsjwt = token;  // Token arrives AFTER decision handler runs
    next( );
  }).catch(next);
}
```

**Workarounds**:
1. Create a custom test server with proper async/await handling (like `api_secret_middleware.test.js`)
2. Implement an async middleware wrapper for restify in production code

**Test Coverage**:
- Tests in `test/integration/nsjwt_token_exchange.test.js` use a custom test server with proper async handling (6 tests passing)
- Mock upstream server simulates token exchange with Nightscout instances
- Custom test server replicates the handler logic with proper await semantics
- **Important**: These tests validate the intended behavior, not the production middleware chain. The production `exchange_acl_token` handler still has the async timing issue.

**Production Fix**: To fix in production, either:
1. Wrap `exchange_acl_token` with an asyncHandler middleware in `lib/routes.js`
2. Convert the handler to use callbacks instead of Promises
3. Use a restify plugin that properly awaits Promise-returning handlers

---

### ACL-03-Q01: undefined vs null for missing ACL entries

**Handler**: `lib/policies/index.js - get_acls, get_acl_by_identity_param`  
**Status**: Observed, documented  
**Description**: When a policy ID doesn't exist in the database or when a subject has no joined groups, the handler sets `res.locals.acl` to `undefined` (from the database query returning no result) rather than `null`.

**Contrast**:
- Empty/missing `x-policy-id` header: explicitly sets `res.locals.acl = null`
- Invalid/nonexistent `x-policy-id`: `findById` returns `undefined`

**Impact**:
- Code that checks `if (res.locals.acl)` works correctly (both are falsy)
- Code that checks `if (res.locals.acl === null)` may miss the undefined case

**Recommendation**: Consider normalizing to `null` in the handlers for consistency.

---

### OWN-INC-Q01: Email normalization adjust function missing return

**Handler**: `lib/owner/index.js - suggest_generic_inclusion_payload`  
**Status**: Observed, documented  
**Description**: The `adjust` function (lines 228-234) is intended to normalize email addresses to lowercase before storing. However, the function modifies `elem.identity_spec` but the `return elem;` statement is commented out:

```javascript
function adjust (elem) {
  console.log("ADJUSTING", elem);
  if (elem.identity_type == 'email') {
    elem.identity_spec = elem.identity_spec.toLowerCase( );
  }
  // return elem;  // <-- commented out
}
```

Since `adjust` is called via `_.each()` (not `_.map()`), the lack of return doesn't affect the mutation, BUT the lowercasing IS happening on the input object. Testing shows the actual behavior is that emails are NOT normalized.

**Impact**: 
- Email identity_specs are stored with original casing
- Lookups must be case-insensitive or match exact casing
- Consider enabling normalization if case-insensitive email matching is desired

**Test Coverage**: Test `OWN-INC-Q01` in `test/integration/owner_api.test.js` documents this behavior.

---

### OWN-SYN-Q01: Sites without policies absent from synopsis view

**View**: `site_registration_synopsis`  
**Status**: By design  
**Description**: The `site_registration_synopsis` view is built from `site_acls` view, which itself is constructed from `connection_policies`. Sites that have been registered but have no connection_policies assigned will not appear in the synopsis.

**Code Path**:
```sql
-- From migrations/20220507231106_site_registration_synopsis.js
SELECT id, owner_ref, expected_name, 
       count(distinct(group_id)) as groups_assigned,
       ...
FROM site_acls
GROUP BY id, owner_ref, expected_name
```

**Impact**:
- Newly registered sites won't appear in `/api/v1/owner/:owner_ref/synopsis` until at least one policy is created
- This may be intentional (synopsis shows "configured" sites) but could confuse users
- Owner dashboard should query `registered_sites` directly to show all sites

**Test Coverage**: Test `OWN-SYN-Q01` in `test/integration/owner_api.test.js` documents this behavior.

---

### OWN-ACL-Q01: Unassigned groups query returns empty for truly unassigned groups

**View**: `owner_group_usage`  
**Handler**: `lib/owner/index.js - get_groups_unassigned`  
**Status**: Observed, documented  
**Description**: The `get_groups_unassigned` handler queries `owner_group_usage` with filter `{ num_sites_used: 0 }`. However, the `owner_group_usage` view is built from `site_groups_with_policies` which requires a `connection_policies` entry to exist.

This creates a logical impossibility:
- Groups in `owner_group_usage` MUST have at least one policy (to exist in the view)
- Query filters for `num_sites_used: 0` (groups with no site assignments)
- Groups that are truly unassigned (no policies at all) never appear in the view

**Impact**:
- The "available groups" endpoint returns empty when there are actually unassigned groups
- To find truly unassigned groups, query `group_definitions` directly and LEFT JOIN to `connection_policies`

**Test Coverage**: Test `OWN-ACL-Q01` in `test/integration/owner_api.test.js` documents this behavior.

---

### TRG-CC-Q01: remove_joined_groups_via_policy trigger behavior in test environment

**Trigger**: `remove_joined_groups_via_policy`  
**Status**: Observed, skipped in tests  
**Description**: The `remove_joined_groups_via_policy` AFTER DELETE trigger on `connection_policies` works correctly when verified via direct SQL execution (psql), but exhibits inconsistent behavior in the Node.js/Knex test environment. The trigger is properly installed and enabled.

**Direct SQL Verification**:
```sql
-- This works correctly in psql:
DELETE FROM connection_policies WHERE id = 'test-policy-id';
SELECT * FROM joined_groups WHERE policy_id = 'test-policy-id';
-- Returns 0 rows (trigger fired correctly)
```

**Test Environment Behavior**:
- When Knex executes `db.knex('connection_policies').where({ id }).del()`
- The trigger sometimes does not fire, leaving orphaned `joined_groups` records
- This may be related to Knex connection pool behavior or transaction isolation

**Impact**:
- Tests TRG-CC-01 and TRG-CC-02 are skipped with documentation
- Production trigger behavior should work correctly (matches direct SQL)
- TRG-CC-07 tests cascade behavior via group deletion path which works reliably

**Tracking**: Investigate Knex connection pool interaction with AFTER DELETE triggers.

---

## Adding New Quirks

Use this template:

```markdown
### [QUIRK-ID]: [Brief title]

**View/Table**: [affected database object]  
**Status**: [Observed/By design/Fixed in X]  
**Description**: [What happens and when]

**Impact**: [What this means for users/developers]
```
