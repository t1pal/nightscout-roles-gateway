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

## Adding New Quirks

Use this template:

```markdown
### [QUIRK-ID]: [Brief title]

**View/Table**: [affected database object]  
**Status**: [Observed/By design/Fixed in X]  
**Description**: [What happens and when]

**Impact**: [What this means for users/developers]
```
