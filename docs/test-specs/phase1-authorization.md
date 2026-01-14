# Test Specification: Phase 1 - Authorization & Policy Resolution

This document specifies the expected behaviors for the Warden Gateway authorization layer. These specs serve as the source of truth for writing both unit and integration tests.

## Overview

The authorization system consists of:
1. **Site lookup** - Finding the registered site by `expected_name`
2. **Identity resolution** - Determining who is making the request
3. **ACL lookup** - Finding applicable policies for the user
4. **API secret check** - Legacy escape hatch verification
5. **Decision function** - Core authorization logic
6. **Response formatting** - Headers and payload construction

---

## 1. Site Lookup (`find_expected_name`)

### Expected Behaviors

| ID | Scenario | Input | Expected Result |
|----|----------|-------|-----------------|
| SL-01 | Valid site lookup | `expected_name` exists in `registered_sites` | `req.site` populated with site record |
| SL-02 | Unknown site | `expected_name` not found | Handler calls `next(rows)` with empty array |
| SL-03 | BYOD site with authenticity record | Site has entry in `nightscout_authenticity_records` | `req.site` includes `confirmed_upstream`, `status`, `acceptable` fields |
| SL-04 | BYOD site without authenticity check | Site exists, no authenticity record | `req.site.acceptable` is null/undefined |
| SL-05 | Multiple sites (data integrity issue) | `expected_name` returns >1 row | Handler calls `next(rows)` - should not proceed |

### Test Data Requirements

```javascript
const fixtures = {
  validSite: {
    expected_name: 'testsite',
    owner_ref: 'owner-123',
    upstream_origin: 'https://test-ns.herokuapp.com',
    is_enabled: true,
    require_identities: false,
    exempt_matching_api_secret: false
  },
  byodSiteAccepted: {
    expected_name: 'byod-good',
    owner_ref: 'owner-456',
    upstream_origin: 'https://user-ns.example.com',
    is_enabled: true,
    acceptable: true
  },
  byodSiteRejected: {
    expected_name: 'byod-bad',
    owner_ref: 'owner-789',
    upstream_origin: 'https://fake-ns.example.com',
    is_enabled: true,
    acceptable: false
  }
};
```

---

## 2. Access Mode Tests

### Mode A: Anonymous/Public Access

| ID | Scenario | Site Config | Request Context | Expected |
|----|----------|-------------|-----------------|----------|
| AM-A01 | Anonymous access allowed | `is_enabled: true`, `require_identities: false` | No session, no API-SECRET | 200 + upstream headers |
| AM-A02 | Anonymous access - site disabled | `is_enabled: false`, `require_identities: false` | No session | 403 |
| AM-A03 | Anonymous with authenticated user | `is_enabled: true`, `require_identities: false` | Valid session | 200 (identity not required but accepted) |

### Mode B: Identity-Mapped Access

| ID | Scenario | Site Config | Request Context | Expected |
|----|----------|-------------|-----------------|----------|
| AM-B01 | Identity required, user has ACL allow | `require_identities: true` | Session + ACL with `policy_spec: 'allow'` | 200 |
| AM-B02 | Identity required, user has ACL deny | `require_identities: true` | Session + ACL with `policy_spec: 'deny'` | 403 |
| AM-B03 | Identity required, no session | `require_identities: true` | No session, no API-SECRET | 403 |
| AM-B04 | Identity required, session but no ACL | `require_identities: true` | Valid session, no joined_groups record | 403 |
| AM-B05 | Identity required, NSJWT policy | `require_identities: true` | Session + ACL `policy_type: 'nsjwt'` + valid token | 200 + X-NSJWT header |
| AM-B06 | NSJWT policy but no token available | `require_identities: true` | Session + ACL `policy_type: 'nsjwt'`, token exchange failed | 403 |

### Mode C: Legacy Escape Hatch

| ID | Scenario | Site Config | Request Context | Expected |
|----|----------|-------------|-----------------|----------|
| AM-C01 | Matching API-SECRET, escape enabled | `exempt_matching_api_secret: true` | Valid `API-SECRET` header | 200 |
| AM-C02 | Matching API-SECRET, escape disabled | `exempt_matching_api_secret: false` | Valid `API-SECRET` header | Fallback to other modes |
| AM-C03 | Wrong API-SECRET | `exempt_matching_api_secret: true` | Invalid `API-SECRET` header | Fallback to other modes |
| AM-C04 | No API-SECRET header | `exempt_matching_api_secret: true` | No header | Fallback to other modes |
| AM-C05 | API-SECRET bypasses identity requirement | `require_identities: true`, `exempt_matching_api_secret: true` | Valid `API-SECRET`, no session | 200 |

### Mode Combinations

| ID | Scenario | Site Config | Request Context | Expected |
|----|----------|-------------|-----------------|----------|
| MC-01 | B+C: Identity user, escape available | `require_identities: true`, `exempt_matching_api_secret: true` | Session + ACL allow | 200 (via identity) |
| MC-02 | B+C: Device with API-SECRET | `require_identities: true`, `exempt_matching_api_secret: true` | No session, valid API-SECRET | 200 (via escape hatch) |
| MC-03 | B+C: No credentials | `require_identities: true`, `exempt_matching_api_secret: true` | No session, no API-SECRET | 403 |

---

## 3. BYOD Authenticity Gate

When `env.upstream.strictly_nightscout` is enabled:

**Important**: The code evaluates `active = site.acceptable && active`. This means:
- `acceptable: true` → active remains true (pass)
- `acceptable: false` → active becomes false (block)
- `acceptable: null/undefined` → active becomes falsy (block, since `null && true = null` which is falsy)

| ID | Scenario | Site Config | Env Config | Expected |
|----|----------|-------------|------------|----------|
| BYOD-01 | BYOD site acceptable | `is_enabled: true`, `acceptable: true` | `strictly_nightscout: true` | Continue to access mode evaluation |
| BYOD-02 | BYOD site not acceptable | `is_enabled: true`, `acceptable: false` | `strictly_nightscout: true` | 403 (before any other checks) |
| BYOD-03 | BYOD site null acceptable | `is_enabled: true`, `acceptable: null` | `strictly_nightscout: true` | 403 (null && true = falsy) |
| BYOD-04 | BYOD site undefined acceptable | `is_enabled: true`, no `acceptable` field | `strictly_nightscout: true` | 403 (undefined && true = falsy) |
| BYOD-05 | Non-strict mode ignores acceptable | `is_enabled: true`, `acceptable: false` | `strictly_nightscout: false` | Continue (acceptable check skipped) |
| BYOD-06 | Non-strict mode with null acceptable | `is_enabled: true`, `acceptable: null` | `strictly_nightscout: false` | Continue (acceptable check skipped) |

**Note**: The `strictly_nightscout` flag determines whether the authenticity gate is enforced at all. When disabled, the `acceptable` field is not checked.

---

## 4. Decision Function (`decision()`)

### Decision Logic Pseudocode

```
1. active = site.is_enabled
2. IF strictly_nightscout THEN active = active AND site.acceptable
3. IF NOT active THEN RETURN 403
4. IF allow_for_matching_api_secret THEN active = true
5. ELSE IF require_identities THEN active = (acl.policy_spec == 'allow')
6. IF acl.policy_type == 'nsjwt' AND nsjwt.token THEN active = true
7. IF NOT active THEN RETURN 403
8. RETURN 200 with upstream headers
```

### Unit Test Cases for `decision()`

| ID | Input State | Expected Output |
|----|-------------|-----------------|
| D-01 | `is_enabled: false` | `res.status(403)`, `active: false` |
| D-02 | `is_enabled: true`, `strictly_nightscout: true`, `acceptable: false` | `res.status(403)`, `active: false` |
| D-03 | `is_enabled: true`, `allow_for_matching_api_secret: true` | `active: true` |
| D-04 | `is_enabled: true`, `require_identities: true`, `acl.policy_spec: 'allow'` | `active: true` |
| D-05 | `is_enabled: true`, `require_identities: true`, `acl.policy_spec: 'deny'` | `active: false` |
| D-06 | `is_enabled: true`, `require_identities: true`, `acl: null` | `active: false` |
| D-07 | `is_enabled: true`, `require_identities: false` | `active: true` (anonymous) |
| D-08 | `acl.policy_type: 'nsjwt'`, `nsjwt.token: 'valid'` | `active: true` |
| D-09 | `acl.policy_type: 'nsjwt'`, `nsjwt.token: null` | `active: false` |

---

## 5. API Secret Matching (`matches_api_secret`)

### Implementation Details

The `matches_api_secret` handler performs a database query that:
1. Takes the raw `API-SECRET` header value (which should already be SHA1-hashed by the client)
2. Looks up `hashed_api_secret` in `nightscout_secrets` table
3. Joins with `registered_sites` to verify:
   - `expected_name` matches the requested site
   - `is_enabled: true`
   - `exempt_matching_api_secret: true`

**Critical**: The header value is used directly as the hash lookup key. The client is expected to send the SHA1-hashed secret, not the plaintext.

```javascript
// Client-side hashing (what uploaders do):
const crypto = require('crypto');
const shasum = crypto.createHash('sha1');
shasum.update('my-plain-api-secret');
const hashedSecret = shasum.digest('hex');
// Send: { 'API-SECRET': hashedSecret }
```

### Test Cases

| ID | Scenario | Site Config | Header Value | DB State | Expected |
|----|----------|-------------|--------------|----------|----------|
| AS-01 | Valid secret, all conditions met | `is_enabled: true`, `exempt_matching_api_secret: true` | Valid SHA1 hash | Hash exists in `nightscout_secrets` | `allow_for_matching_api_secret: true` |
| AS-02 | Valid secret but escape disabled | `is_enabled: true`, `exempt_matching_api_secret: false` | Valid SHA1 hash | Hash exists | `has_matching_api_secret: true`, `allow_for_matching_api_secret: false` |
| AS-03 | Valid secret but site disabled | `is_enabled: false`, `exempt_matching_api_secret: true` | Valid SHA1 hash | Hash exists | Join fails, `has_matching_api_secret: false` |
| AS-04 | Wrong secret hash | `is_enabled: true`, `exempt_matching_api_secret: true` | Invalid hash | Different hash in DB | `has_matching_api_secret: false` |
| AS-05 | No API-SECRET header | `is_enabled: true`, `exempt_matching_api_secret: true` | No header | Hash exists | `has_matching_api_secret: false` |
| AS-06 | No secret registered for site | `is_enabled: true`, `exempt_matching_api_secret: true` | Valid hash | No entry for site | `has_matching_api_secret: false` |
| AS-07 | Secret for different site | `is_enabled: true`, `exempt_matching_api_secret: true` | Hash for site B | Hash exists for site B only | `has_matching_api_secret: false` |

### Fallback Behavior

When `allow_for_matching_api_secret: false`, the request continues to identity-based evaluation. This is the "fallback to other modes" behavior:

| ID | Scenario | Result After API-SECRET Check | Next Step |
|----|----------|------------------------------|-----------|
| AS-FB01 | Secret matches, escape disabled | `allow_for_matching_api_secret: false` | Continue to identity check |
| AS-FB02 | Secret doesn't match | `has_matching_api_secret: false` | Continue to identity check |
| AS-FB03 | No secret provided | `has_matching_api_secret: false` | Continue to identity check |

---

## 6. Response Headers

### Success Response (200)

| ID | Scenario | Expected Headers |
|----|----------|------------------|
| RH-01 | Standard allow | `x-upstream-origin: {upstream_origin}`, `x-forwarded-host: {hostname}` |
| RH-02 | Allow with NSJWT | Above + `X-NSJWT: {token}` |

### Denial Response (403)

| ID | Scenario | Expected |
|----|----------|----------|
| RH-03 | Access denied | No `x-upstream-origin` header set |

---

## 7. Schedule Evaluation

Schedule tests verify that `unified_active_site_policies` view correctly applies time-based overrides and that `res.locals.acl` is properly populated.

### How Schedules Work

1. `scheduled_policies` table stores `fill_pattern` and `schedule_segments`
2. `site_policy_schedules` view parses these into structured data
3. `site_policy_schedules_active` view filters to current time window
4. `unified_active_site_policies` view merges schedule overrides: `COALESCE(sch.spec, acl.policy_spec)`

### Schedule Test Cases

| ID | Scenario | Schedule Config | Current Time | Expected `policy_spec` in ACL |
|----|----------|-----------------|--------------|------------------------------|
| SCH-01 | Within allowed window | `fill_pattern: "deny,allow,deny"`, segments at Mon-Fri 9am-3pm | Tuesday 10am | `allow` |
| SCH-02 | Outside allowed window | Same schedule | Tuesday 8pm | `deny` |
| SCH-03 | No schedule defined | Base policy `policy_spec: 'allow'` | Any time | `allow` (base policy) |
| SCH-04 | Schedule with NSJWT | `fill_pattern: "deny,readable,deny"` | During window | `readable` |
| SCH-05 | Schedule overrides base allow | Base: `allow`, Schedule: `deny` during window | During window | `deny` |
| SCH-06 | Schedule overrides base deny | Base: `deny`, Schedule: `allow` during window | During window | `allow` |

### ACL Population via `get_acls` / `get_acl_by_identity_param`

The `res.locals.acl` object is populated by looking up `unified_active_site_policies`:

| ID | Scenario | Input | Expected `res.locals.acl` |
|----|----------|-------|---------------------------|
| ACL-01 | User has policy, no schedule | `x-policy-id` header set | ACL with base `policy_spec` |
| ACL-02 | User has policy with active schedule | `x-policy-id` header set, schedule active | ACL with overridden `policy_spec` |
| ACL-03 | User has no matching policy | Invalid `x-policy-id` | `res.locals.acl: null` |
| ACL-04 | Empty policy ID header | `x-policy-id` empty/missing | `res.locals.acl: null`, continues to next handler |

### `has_schedules` Flag

The `res.locals.policy.has_schedules` flag indicates whether schedule logic applies:

| ID | Scenario | Expected |
|----|----------|----------|
| HS-01 | Policy has associated schedule | `has_schedules: true` |
| HS-02 | Policy has no schedule | `has_schedules: false` |

**Note**: Current implementation sets `has_schedules: false` in the `policy()` handler. Schedule detection may need enhancement.

### Database View Dependencies

Tests must verify the view chain:

```
scheduled_policies (raw data)
    ↓
site_policy_schedules (parsed segments)
    ↓
site_policy_schedules_active (current time filter)
    ↓
unified_active_site_policies (final merged view)
```

| ID | View | Test Focus |
|----|------|------------|
| VW-01 | `site_policy_schedules` | `fill_pattern` parsing, segment boundary calculation |
| VW-02 | `site_policy_schedules_active` | Time-based filtering, current segment detection |
| VW-03 | `unified_active_site_policies` | `COALESCE(sch.spec, acl.policy_spec)` merge logic |

### Decision Integration with Schedules

| ID | Scenario | ACL State | Expected Decision |
|----|----------|-----------|-------------------|
| SD-01 | Schedule says allow, require_identities: true | `policy_spec: 'allow'` | `active: true` |
| SD-02 | Schedule says deny, require_identities: true | `policy_spec: 'deny'` | `active: false` |
| SD-03 | Schedule says allow but site disabled | `policy_spec: 'allow'`, `is_enabled: false` | `active: false` (site check first) |

---

## 8. Integration Test Scenarios

### End-to-End Warden Request Flow

```
GET /warden/v1/active/backend/for/:expected_name
```

| ID | Test Name | Setup | Request | Assertions |
|----|-----------|-------|---------|------------|
| E2E-01 | Anonymous access to public site | Create site with `require_identities: false` | No auth headers | 200, `x-upstream-origin` set |
| E2E-02 | Identity access with valid consent | Create site, group, policy, joined_group | Session cookie + `x-policy-id` | 200, `x-upstream-origin` set |
| E2E-03 | Identity access without consent | Create site, group, policy (no joined_group) | Session cookie | 403 |
| E2E-04 | Legacy device with API-SECRET | Create site with `exempt_matching_api_secret: true`, add secret | `API-SECRET` header | 200 |
| E2E-05 | Disabled site | Create site with `is_enabled: false` | Any request | 403 |
| E2E-06 | BYOD site not validated | Create BYOD site, no authenticity record | Any request (strictly_nightscout mode) | 403 |

---

## 9. Test Infrastructure Requirements

### Database Setup

```javascript
beforeEach(async () => {
  await knex.migrate.rollback();
  await knex.migrate.latest();
  await seedTestData();
});

afterEach(async () => {
  await knex.migrate.rollback();
});
```

### Mock Services

- **Ory Kratos**: Mock `toSession()` to return identity or 401
- **Upstream Nightscout**: Mock JWT exchange endpoint for NSJWT tests
- **Cache (Keyv)**: Use in-memory cache for token caching tests

### Test Utilities

```javascript
function createTestSite(overrides = {}) {
  return {
    owner_ref: 'test-owner',
    expected_name: 'test-site-' + shortId(),
    upstream_origin: 'https://test.nightscout.example.com',
    is_enabled: true,
    require_identities: false,
    exempt_matching_api_secret: false,
    ...overrides
  };
}

function createTestGroup(ownerRef, siteId) {
  // Creates group_definition + connection_policy + group_inclusion_spec
}

function createTestConsent(subject, groupId, policyId, expectedName) {
  // Creates joined_groups record
}
```

---

## 10. Test File Organization

```
test/
├── unit/
│   ├── policies/
│   │   ├── decision.test.js          # D-01 through D-09
│   │   ├── matches_api_secret.test.js # AS-01 through AS-07, AS-FB*
│   │   └── find_expected_name.test.js # SL-01 through SL-05
│   └── views/
│       ├── unified_active_site_policies.test.js # VW-01 through VW-03
│       ├── schedule_evaluation.test.js # SCH-01 through SCH-06
│       └── acl_population.test.js     # ACL-01 through ACL-04
├── integration/
│   ├── warden/
│   │   ├── anonymous_access.test.js   # AM-A01 through AM-A03
│   │   ├── identity_access.test.js    # AM-B01 through AM-B06
│   │   ├── legacy_escape.test.js      # AM-C01 through AM-C05
│   │   ├── mode_combinations.test.js  # MC-01 through MC-03
│   │   ├── byod_gate.test.js          # BYOD-01 through BYOD-06
│   │   └── schedule_decision.test.js  # SD-01 through SD-03
│   └── e2e/
│       └── warden_flow.test.js        # E2E-01 through E2E-06
└── fixtures/
    ├── sites.js
    ├── groups.js
    ├── policies.js
    ├── schedules.js
    └── identities.js
```

---

## Appendix: Coverage Mapping

| Code Path | Spec IDs |
|-----------|----------|
| `find_expected_name()` | SL-01 to SL-05 |
| `decision()` | D-01 to D-09, SD-01 to SD-03 |
| `matches_api_secret()` | AS-01 to AS-07, AS-FB01 to AS-FB03 |
| `get_acls()` / `get_acl_by_identity_param()` | ACL-01 to ACL-04 |
| `specify_upstream_handler()` | RH-01 to RH-03 |
| Schedule views | SCH-01 to SCH-06, VW-01 to VW-03 |
| `has_schedules` flag | HS-01, HS-02 |
| BYOD authenticity gate | BYOD-01 to BYOD-06 |
| Access mode evaluation | AM-A*, AM-B*, AM-C*, MC-* |
| Full handler chain | E2E-01 to E2E-06 |
