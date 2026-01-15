# NRG Test Specifications

This directory contains test specifications that define the expected behaviors of the Nightscout Roles Gateway. These specifications serve as the source of truth for writing both unit and integration tests.

## Current Status

**Core business logic is now well-tested.** The initial test expansion effort achieved broad coverage across authorization, identity, triggers, and API endpoints.

| Metric | Count |
|--------|-------|
| **Tests Passing** | 218 |
| **Skipped (Hydra)** | 5 (use `SKIP_HYDRA_TESTS=1`) |
| **Skipped (Kratos)** | 8 (use `SKIP_KRATOS_TESTS=1`) |
| **Pending** | ~3 (varies by test run) |

**What remains:**
- Token caching logic (`lib/exchanged.js`) - testable now, high value
- Kratos identity flow - requires mock server infrastructure
- BYOD/API inspection - requires network access to upstream instances

*Last updated: January 2026*

---

## Documents

| Phase | Document | Coverage |
|-------|----------|----------|
| Phase 1 | [phase1-authorization.md](./phase1-authorization.md) | Policy resolution, decision logic, access modes, warden gateway |
| Phase 2 | [phase2-identity-access.md](./phase2-identity-access.md) | Privy module, identity resolution, group membership, consent flow |
| Phase 3 | [phase3-criteria-validation.md](./phase3-criteria-validation.md) | BYOD criteria validation, Nightscout inspection pipeline |
| Phase 4 | [phase4-triggers.md](./phase4-triggers.md) | PostgreSQL triggers, secret hashing, cascade cleanup, reserved names |

## How to Use These Specs

### Writing New Tests

1. Find the relevant specification document for the feature you're testing
2. Locate the test case ID (e.g., `D-01`, `SI-03`, `BI-05`)
3. Use the expected behaviors as assertions in your test

### Test Naming Convention

Reference spec IDs in test names for traceability:

```javascript
describe('decision()', function() {
  it('D-01: should deny when site is disabled', function() {
    // Test implementation
  });
  
  it('D-04: should allow when require_identities and ACL allows', function() {
    // Test implementation
  });
});
```

### Coverage Tracking

Each spec document includes an **Appendix: Coverage Mapping** table that maps code paths to spec IDs. Use this to ensure complete coverage.

## Priority Order

1. **Phase 1** - Authorization is the security boundary and should be tested first
2. **Phase 2** - Identity and consent flow enables the identity-mapped access mode
3. **Phase 3** - Criteria validation protects against proxy abuse
4. **Phase 4** - PostgreSQL triggers enforce data integrity at the database level

## Test Types

### View Tests (Implemented)

Test PostgreSQL views for accuracy without external network dependencies:
- `site_policy_schedules` - Schedule expansion and fill_pattern pairing
- `site_policy_schedules_active` - Time window filtering
- `unified_active_site_policies` - COALESCE merge logic and ACL sort order

Location: `test/views/`

**Key Insight**: These views use PostgreSQL-specific features (UNNEST, string_to_array, window functions) and cannot be tested with SQLite. Tests must use PostgreSQL.

### Trigger Tests (Implemented)

Test PostgreSQL trigger behaviors directly against the database:
- `sync_hashed_api_secret` - Secret hashing on INSERT/UPDATE/DELETE
- `remove_joined_groups_via_policy` - Cascade cleanup on policy delete
- `force_leave_group` - Cascade cleanup on inclusion spec delete
- `check_site_reserved_name` - Reserved name validation
- `initialize_connection_policy_sort` - Sort order initialization (quirk documented)

Location: `test/triggers/`

**Key Insight**: Trigger tests verify database-level business rules without requiring HTTP mocking or external services.

### Unit Tests

Test isolated functions with mocked dependencies:
- `decision()` function logic paths
- `matches_api_secret()` API secret validation (AS-01 to AS-07, AS-FB01 to AS-FB03)
- `static_analysis()` validation rules
- `describe()` summary/result generation (DS-01 to DS-05)
- Email normalization

Location: `test/unit/` and `test/unit/criteria/`

### Integration Tests

Test API endpoints with database fixtures:
- Full warden request flow
- Invitation acceptance workflow
- Owner and Privy API workflows

## Running Tests

```bash
# Run all tests
NODE_ENV=test npm test

# Run view tests only
NODE_ENV=test npm test -- --grep "View:"

# Run trigger tests only
NODE_ENV=test npm test -- --grep "Trigger:"

# Run specific view test
NODE_ENV=test npm test -- --grep "site_policy_schedules"

# Run specific trigger test
NODE_ENV=test npm test -- --grep "sync_hashed_api_secret"
```

## Test Coverage Summary

| Area | Spec IDs | Tests | Status |
|------|----------|-------|--------|
| View: site_policy_schedules | SPV-* | 6 | ✅ Implemented |
| View: site_policy_schedules_active | SPVA-* | 6 | ✅ Implemented |
| View: unified_active_site_policies | UASP-* | 8 | ✅ Implemented |
| Static analysis | SA-01 to SA-14 | 19 | ✅ Implemented |
| describe() summary | DS-01 to DS-05 | 8 | ✅ Implemented |
| Decision function | D-01 to D-09 | 15 | ✅ Implemented |
| API secret matching | AS-01 to AS-07, AS-FB01 to AS-FB03 | 10 | ✅ Implemented |
| Email normalization | GI-01 to GI-04 | 11 | ✅ Implemented |
| Site lookup | SL-01 to SL-05 | 6 | ✅ Implemented |
| Trigger: sync_hashed_api_secret | TRG-HS-01 to TRG-HS-14 | 15 | ✅ Implemented |
| Trigger: cascade cleanup | TRG-CC-01 to TRG-CC-07 | 7 | ✅ Implemented |
| Trigger: reserved validation | TRG-RN-01 to TRG-RN-12 | 12 | ✅ Implemented |
| Trigger: sort order | TRG-SO-01 to TRG-SO-06 | 6 | ✅ Implemented (quirk documented) |
| Unit: ACL lookup handlers | ACL-01 to ACL-04 | 11 | ✅ Implemented (quirk ACL-03-Q01 documented) |
| Integration: about_server | - | 1 | ✅ Implemented |
| Integration: site_registration | - | 6 (1 pass, 5 skipped) | ⏭️ 5 skipped without Hydra (INT-SR-Q01) |
| Integration: warden_flow | E2E-01 to E2E-06 | 8 | ⏭️ Skipped without Kratos (E2E-Q01, E2E-Q02) |
| Integration: portal_identity_access | AM-B01 to AM-B04, ACL-02, MC-01, MC-03 | 11 (10 pass, 1 pending) | ✅ Implemented |
| Integration: api_secret_middleware | AS-01 to AS-05, AS-FB01, MC-02 | 7 | ✅ Implemented (custom test server) |
| Integration: nsjwt_token_exchange | AM-B05, AM-B06 | 6 | ✅ Implemented (custom test server) |
| Integration: privy_consent_flow | JG-01, SJ-*, RV-*, IF-* | 13 | ✅ Implemented (portal endpoint bypass) |
| Integration: owner_site_deletion | OWN-SITE-DEL-* | 7 | ✅ Implemented (documents quirks Q01-Q04) |
| Integration: privy_edge_cases | EC-01, EC-05, EC-06 | 9 | ✅ Implemented |
| Kratos identity | IR-* | - | 🔲 Requires mocking |
| API inspection | BI-*, AI-* | - | 🔲 Requires network |

---

## Remaining Coverage Gaps

### Priority 1: Token Caching Logic (Testable Now)

**Module**: `lib/exchanged.js`

This is the only high-value area that can be tested without external infrastructure. The token caching layer handles:
- Cache hit/miss for NSJWT tokens
- TTL calculation and storage
- Error handling when cache or upstream fails

**Recommended approach**: Unit tests with mocked Keyv cache and axios HTTP client.

**Test cases to cover**:
- Cache hit returns cached token without upstream call
- Cache miss triggers upstream fetch and stores result
- TTL is calculated correctly from `exp - iat`
- Cache write failure still returns token (graceful degradation)
- Upstream failure propagates error correctly

### Priority 2: External Service Dependencies (Long-term)

These require mock server infrastructure and are optional for core coverage:

- **Kratos identity flow** (IR-*) - Requires mock Kratos server for `/sessions/whoami`
- **Hydra OAuth flow** - 5 tests skipped, requires running Hydra instance

### Priority 3: BYOD/API Inspection (Deferred)

- **Basic inspection** (BI-*) - Requires network access to upstream Nightscout
- **Authenticated inspection** (AI-*) - Requires network access with valid tokens

These are deferred as they require network mocking infrastructure that doesn't currently exist.

---

## Implicitly Covered Modules

The following modules do **not** need dedicated tests because they are exercised extensively through existing tests:

| Module | Why It's Covered |
|--------|------------------|
| `lib/bootevent.js` | Every integration test that starts a server runs the boot sequence |
| `lib/entities/index.js` | All integration tests creating sites/groups/policies use this entity layer |
| `lib/storage.js` | All trigger, view, and integration tests exercise the database layer |
| `lib/synopsis.js` | Tested directly through owner_api integration tests |

---

## Lessons Learned for Contributors

### 1. Restify Async Handler Pattern (CRITICAL)
Restify's middleware chain does **not** await Promises. If your handler returns a Promise, subsequent handlers run before it resolves.

**Problem pattern (breaks in Restify):**
```javascript
function myHandler(req, res, next) {
  return asyncOperation().then(result => {
    res.locals.data = result;  // Set AFTER next handler runs!
    next();
  });
}
```

**Solution - Use asyncHandler wrapper in tests:**
```javascript
function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Then use async/await inline:
testServer.get('/path', asyncHandler(async function(req, res, next) {
  res.locals.data = await asyncOperation();  // Properly awaited
  // ... rest of handler
}));
```

See `test/integration/api_secret_middleware.test.js` and `test/integration/nsjwt_token_exchange.test.js` for working examples.

### 2. Portal Endpoint Bypass (E2E-Q03)
The `/warden/v1/portal/:subject/` endpoint accepts subject as a URL parameter, bypassing Kratos session lookup. Use this to test identity-based access control without mocking Kratos.

### 3. Mock Upstream Server Pattern
For testing handlers that make HTTP calls to upstream Nightscout instances (e.g., NSJWT token exchange), create a mock HTTP server:
```javascript
const mockServer = http.createServer((req, res) => {
  if (req.url.startsWith('/api/v2/authorization/request/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: 'mock-token', iat: now, exp: now + 3600 }));
  }
});
mockServer.listen(0, '127.0.0.1', () => { /* dynamic port */ });
```

### 4. Fixtures Pattern
Use `test/setup/fixtures.js` for creating test data. It handles ID generation and provides consistent helpers for sites, groups, policies, etc.

### 5. Database Isolation
Each test file should:
- Run `store.migrate.rollback()` and `store.migrate.latest()` in `before()`
- Truncate tables in `beforeEach()` to isolate tests
- Rollback and destroy in `after()`

---

## Discovered Quirks

See `test/quirks/README.md` for full details. Quirks are categorized below:

### By Design (Expected Behavior)

| Quirk ID | Summary |
|----------|---------|
| SPV-Q01 | Mismatched fill_pattern and segment count uses modulo cycling |
| SPVA-Q01 | Schedule filtering uses database server time, not client time |
| UASP-Q01 | COALESCE skips NULL schedule specs (intentional) |
| SL-Q01 | Unique constraint on expected_name prevents duplicate sites |

### Fixed

| Quirk ID | Summary |
|----------|---------|
| MAS-Q01 | `matches_api_secret` handler missing `.catch(next)` - **FIXED** |

### Known Limitations

| Quirk ID | Summary |
|----------|---------|
| TRG-SO-Q01 | Sort order trigger not installed (migration bypass) |
| TRG-HS-Q01 | api_secret column limited to 255 characters |
| ACL-03-Q01 | undefined vs null for missing ACL entries (consistency concern) |
| NSJWT-Q01 | Async timing issue in token exchange handler - mitigated in tests, production still affected |
| UASP-Q02 | Multiple active schedules per policy create duplicate ACL entries |

### External Service Dependencies (Skipped Tests)

| Quirk ID | Summary |
|----------|---------|
| INT-SR-Q01 | Site registration tests require ORY Hydra service (skipped via `SKIP_HYDRA_TESTS=1`) |
| E2E-Q01 | Identity tests (E2E-02, E2E-03) require Kratos mock server for session injection |
| E2E-Q02 | API-SECRET matching test (E2E-04) has async handler timing issue in restify chain |
| E2E-Q03 | Portal endpoint (`/warden/v1/portal/:subject/`) bypasses Kratos, enabling identity tests without mocking |

### Cascade Gaps (Documented Design Decisions)

| Quirk ID | Summary |
|----------|---------|
| OWN-SITE-DEL-Q01 | Site deletion does NOT cascade to connection_policies (no FK constraint) |
| OWN-SITE-DEL-Q02 | Site deletion does NOT cascade to joined_groups (no FK constraint) |
| OWN-SITE-DEL-Q03 | Site deletion does NOT cascade to oauth2_credentials (no FK constraint) |
| OWN-SITE-DEL-Q04 | Group deletion does NOT cascade to connection_policies (trigger only deletes inclusions) |

---

## Related Documentation

- [Access Modes](../access-modes.md) - The three orthogonal access conditions
- [Warden Gateway](../warden-gateway.md) - Authorization layer details
- [Privy Identity Access](../privy-identity-access.md) - Identity module details
- [Criteria System](../criteria-system.md) - BYOD validation pipeline
