# Test Specification: Phase 2 - Privy Identity & Access

This document specifies the expected behaviors for the Privy module, which handles identity verification, group membership, and consent tracking.

## Overview

Privy answers three questions:
1. **Who is this person?** - Identity resolution via Ory Kratos
2. **Were they invited?** - Group inclusion specification matching
3. **Did they consent?** - Joined groups record verification

---

## 1. Identity Resolution

### Kratos Session Resolution (`kratos_whoami`)

| ID | Scenario | Input | Expected Result |
|----|----------|-------|-----------------|
| IR-01 | Valid session cookie | Valid Kratos session | `req.user` populated with identity, `res.locals.session` set |
| IR-02 | Invalid/expired session (401) | Invalid or expired cookie | `req.user` set to anonymous: `{ id: 'anonymous', traits: { email: '*' } }`, `res.locals.session` set to error response data |
| IR-03 | No session cookie | No Cookie header | Kratos returns 401, anonymous fallback applied |
| IR-04 | Kratos returns 403 | Valid cookie but forbidden | Error bubbles through `next()` (not caught as 401) |
| IR-05 | Kratos network error | ECONNREFUSED/timeout | Error bubbles through `next()` |
| IR-06 | Kratos returns 500 | Server error | Error bubbles through `next()` |

### Error Handling Details

The `kratos_whoami` handler has specific error handling:

```javascript
.catch(function (error) {
  if (error.response.status == '401') {
    // Anonymous fallback - ONLY for 401
    res.locals.session = error.response.data;
    req.user = { id: 'anonymous', traits: { email: '*' } };
  }
  next( ); // Always calls next, but error may propagate
});
```

**Important**: Only HTTP 401 triggers anonymous fallback. Other errors (403, 500, network) propagate via `next()` without setting `req.user`.

| ID | Error Type | `error.response.status` | Result |
|----|------------|-------------------------|--------|
| EH-01 | Session expired | `'401'` | Anonymous identity assigned, continues |
| EH-02 | Forbidden | `'403'` | Error propagates, `req.user` undefined |
| EH-03 | Server error | `'500'` | Error propagates, `req.user` undefined |
| EH-04 | Network failure | N/A (no response) | `error.response` undefined, may throw |

### Admin Identity Lookup (`privy_id`)

| ID | Scenario | Input | Expected Result |
|----|----------|-------|-----------------|
| IR-07 | Valid identity ID | Existing Kratos identity ID | `res.locals.identity` populated with full identity |
| IR-08 | Unknown identity ID | Non-existent identity ID | Error propagated via `next()` |
| IR-09 | Kratos admin API error | Network/auth error | Error propagated via `next()` |

### Anonymous Identity Fixture

```javascript
const anonymousIdentity = {
  id: 'anonymous',
  traits: {
    email: '*'
  }
};
```

---

## 2. Group Inclusion Specification Matching

### Email Normalization

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| GI-01 | Lowercase email match | Spec: `alice@example.com`, User email: `alice@example.com` | Match |
| GI-02 | Mixed case user email | Spec: `alice@example.com`, User email: `Alice@Example.COM` | Match (after normalization) |
| GI-03 | Mixed case spec | Spec stored as `Alice@Example.COM` | Should be stored lowercase |
| GI-04 | Email mismatch | Spec: `alice@example.com`, User email: `bob@example.com` | No match |

#### Implementation Notes (GI-01 to GI-04)

**Test File**: `test/unit/privy/email_normalization.test.js`

**GI-03 Implementation**:
The `adjustEmailSpec()` function in `lib/privy/index.js` normalizes email specs to lowercase during the API storage flow. It is exported for testability:

```javascript
const { adjustEmailSpec } = require('../../../lib/privy');

function adjustEmailSpec(elem) {
  if (elem.identity_type == 'email') {
    elem.identity_spec = elem.identity_spec.toLowerCase();
  }
}
```

Note: The function mutates the object in place (no return value). It is called by the internal `adjust()` wrapper during suggestion processing.

**GI-02 Implementation**:
The `normalizeUserEmail()` function in `lib/privy/index.js` normalizes user emails to lowercase before querying. It is exported for testability:

```javascript
const { normalizeUserEmail } = require('../../../lib/privy');

function normalizeUserEmail(email) {
  if (typeof email === 'string') {
    return email.toLowerCase();
  }
  return email;
}
```

The `search_inclusions()` and `suggest_join_spec()` handlers use this function:

```javascript
var query = {
  identity_type: 'email',
  identity_spec: normalizeUserEmail(req.user.traits.email)
};
```

**Note**: PostgreSQL string matching is case-sensitive, so both the stored specs (via `adjustEmailSpec()`) and user emails (via `normalizeUserEmail()`) must be normalized to lowercase for matching to work correctly.

**Tested Behavior** (11 tests):
- `normalizeUserEmail('Alice@Example.COM')` → `'alice@example.com'`
- Spec stored as lowercase: `"alice@example.com"`
- User email normalized before query
- Result: **Match** (1 result)

### Search Inclusions (`search_inclusions`)

**Route Parameter Availability**: The `search_inclusions` handler reads parameters differently based on which route mounts it:

| Route | `req.params.group_id` | `req.params.expected_name` |
|-------|----------------------|---------------------------|
| `/privy/:identity/groups/available` | Not available | Not available |
| `/privy/:identity/groups/available/:expected_name` | Not available | Available |
| `/privy/:identity/groups/available/details/:group_id` | Available | Not available |

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| SI-01 | User has pending invitation | User email matches inclusion spec, no joined_groups | Returns ACL with `subject: null` |
| SI-02 | User has accepted invitation | User email matches, has joined_groups | Returns ACL with `subject: <user_id>` |
| SI-03 | Filter by join_spec=available | `join_spec=available` query param | Only returns non-joined entries (whereNull subject) |
| SI-04 | Filter by join_spec=joined | `join_spec=joined` query param | Only returns joined entries (where subject = user.id) |
| SI-05 | Filter by expected_name | `expected_name` path param (specific route) | Only returns entries for that site |
| SI-06 | Filter by group_id | `group_id` path param (specific route) | Only returns entries for that group |
| SI-07 | No matching inclusion | User email not in any spec | Returns empty results |
| SI-08 | Pagination | `perPage=5, currentPage=2` | Returns paginated results |
| SI-09 | No join_spec filter | Neither available nor joined | Returns all matching entries (no subject filter) |

### Identity Type Support

| ID | Type | Status | Expected Behavior |
|----|------|--------|-------------------|
| IT-01 | `email` | Implemented | Exact match after lowercase normalization |
| IT-02 | `anonymous` | Implemented | Matches anonymous identity (email: `*`) |
| IT-03 | `organization` | Planned | Should return no matches (not implemented) |
| IT-04 | `subject` | Planned | Should return no matches (not implemented) |

---

## 3. Consent Flow (Joined Groups)

### Accepting Invitation (`record_joined_group`)

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| JG-01 | Valid join request | All required fields present | `joined_groups` record created |
| JG-02 | Missing group_id | `group_id` absent | Validation error |
| JG-03 | Missing group_spec_id | `group_spec_id` absent | Validation error |
| JG-04 | Missing policy_id | `policy_id` absent | Validation error |
| JG-05 | Missing expected_name | `expected_name` absent | Validation error |
| JG-06 | Duplicate join attempt | Same user, same group already joined | Should be idempotent or return existing |
| JG-07 | Join without matching spec | User not in inclusion specs | Should fail gracefully |

### Required Fields for Join

```javascript
const requiredJoinFields = [
  'group_id',
  'group_spec_id',
  'policy_id',
  'expected_name'
];

// Automatically added by handler:
// - id (generated)
// - subject (from req.user.id)
```

### Searching Joined Groups (`search_joined_groups`)

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| SJ-01 | User has joined groups | User with `joined_groups` records | Returns all joined groups |
| SJ-02 | User has no joined groups | User with no records | Returns empty array |
| SJ-03 | Filter by group_id | `group_id` path param | Returns specific membership |
| SJ-04 | Filter by expected_name | `expected_name` in query | Returns site-specific memberships |

### Revoking Consent (`exit_joined_group`)

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| RV-01 | Valid revocation | All required fields match existing record | Record deleted, 204 returned |
| RV-02 | Non-existent membership | Query matches no records | 204 (idempotent) |
| RV-03 | Partial match | Some fields match but not all | No deletion, 204 |

---

## 4. Invitation Flow End-to-End

### Happy Path

```
1. Owner creates inclusion spec (email: "mom@example.com")
2. Mom logs in to WWW Viewer
3. GET /privy/:identity/groups/available → Shows pending invitation
4. POST /privy/:identity/groups/joined → Mom accepts
5. GET /warden/v1/active/backend/for/kidsite → Access granted
```

### Test Cases

| ID | Scenario | Steps | Expected Final State |
|----|----------|-------|---------------------|
| IF-01 | Complete invitation flow | Create spec → User login → Accept | `joined_groups` record exists, access granted |
| IF-02 | Invitation without login | Create spec → User not logged in | User sees no invitations (anonymous) |
| IF-03 | Accept then revoke | Accept invitation → Revoke consent | Record deleted, access denied |
| IF-04 | Multiple invitations | User invited to 3 groups | User sees 3 pending, can accept each |
| IF-05 | Cross-site isolation | User joins Site A group | Site B access unchanged |

---

## 5. OAuth Client Integration

### Invitations by Client ID (`invitations_by_client_id`)

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| OC-01 | Valid client_id lookup | Known OAuth client ID | Returns matching invitations |
| OC-02 | Unknown client_id | Non-existent client ID | Returns empty results |
| OC-03 | Client without invitations | Valid client, no matching specs | Returns empty results |

---

## 6. Edge Cases

| ID | Edge Case | Expected Behavior |
|----|-----------|-------------------|
| EC-01 | User joins same group twice | Idempotent - no duplicate, return success |
| EC-02 | Invitation removed after user saw it | User cannot accept (spec no longer exists) |
| EC-03 | Owner deletes group after user joined | User's access revoked (cascading effect) |
| EC-04 | Email changed in Kratos | New email doesn't match old invitations |
| EC-05 | Very long email address | Should be handled (database column length) |
| EC-06 | Special characters in email | Valid RFC 5321 emails should work |
| EC-07 | Null/undefined email trait | Should not match any spec, anonymous fallback |

---

## 7. Integration Test Scenarios

### API Endpoint Tests

```
POST /api/v1/objects/Role
GET  /api/v1/privy/:identity/groups/available
POST /api/v1/privy/:identity/groups/joined
GET  /api/v1/privy/:identity/groups/joined
DELETE /api/v1/privy/:identity/groups/joined/:group_id
```

| ID | Test Name | Setup | Request | Assertions |
|----|-----------|-------|---------|------------|
| E2E-P01 | Create inclusion spec | Create group | POST Role with email spec | 200, spec created |
| E2E-P02 | List available invitations | Spec exists for user | GET available | 200, invitation in list |
| E2E-P03 | Accept invitation | Spec exists | POST joined | 200, joined_groups created |
| E2E-P04 | List joined groups | User has joined | GET joined | 200, membership in list |
| E2E-P05 | Revoke consent | User has joined | DELETE joined/:id | 204, record removed |
| E2E-P06 | Access after join | User joined group | GET warden endpoint | 200, access granted |
| E2E-P07 | Access after revoke | User revoked | GET warden endpoint | 403, access denied |

---

## 8. Mock Requirements

### Ory Kratos Mock

```javascript
const kratosMock = {
  toSession: async (undefined, cookie) => {
    if (cookie === 'valid_session_cookie') {
      return {
        data: {
          identity: {
            id: 'user-123',
            traits: { email: 'test@example.com' }
          }
        }
      };
    }
    throw { response: { status: '401', data: {} } };
  },
  
  adminGetIdentity: async (id) => {
    if (id === 'user-123') {
      return {
        data: {
          id: 'user-123',
          traits: { email: 'test@example.com' }
        }
      };
    }
    throw new Error('Identity not found');
  }
};
```

---

## 9. Test File Organization

```
test/
├── unit/
│   └── privy/
│       ├── kratos_whoami.test.js      # IR-01 through IR-04
│       ├── search_inclusions.test.js  # SI-01 through SI-08
│       ├── email_normalization.test.js # GI-01 through GI-04
│       └── joined_groups.test.js      # JG-*, SJ-*, RV-*
├── integration/
│   └── privy/
│       ├── invitation_flow.test.js    # IF-01 through IF-05
│       ├── api_endpoints.test.js      # E2E-P01 through E2E-P07
│       └── oauth_client.test.js       # OC-01 through OC-03
└── fixtures/
    ├── identities.js
    ├── inclusion_specs.js
    └── joined_groups.js
```

---

## 10. Test Data Fixtures

```javascript
const fixtures = {
  users: {
    alice: {
      id: 'kratos-alice-123',
      traits: { email: 'alice@example.com', name: { first: 'Alice' } }
    },
    bob: {
      id: 'kratos-bob-456',
      traits: { email: 'bob@example.com', name: { first: 'Bob' } }
    },
    anonymous: {
      id: 'anonymous',
      traits: { email: '*' }
    }
  },
  
  inclusionSpecs: {
    aliceInvite: {
      group_definition_id: 'grp-001',
      identity_type: 'email',
      identity_spec: 'alice@example.com',
      nickname: 'Alice'
    }
  },
  
  joinedGroups: {
    aliceJoined: {
      subject: 'kratos-alice-123',
      expected_name: 'test-site',
      group_id: 'grp-001',
      group_spec_id: 'spec-001',
      policy_id: 'pol-001'
    }
  }
};
```

---

## Appendix: Coverage Mapping

| Code Path | Spec IDs |
|-----------|----------|
| `kratos_whoami()` | IR-01 to IR-04 |
| `privy_id()` | IR-05, IR-06 |
| `search_inclusions()` | SI-01 to SI-08, GI-01 to GI-04 |
| `suggest_join_spec()` | JG-01 to JG-07 |
| `record_joined_group()` | JG-01 to JG-07 |
| `search_joined_groups()` | SJ-01 to SJ-04 |
| `exit_joined_group()` | RV-01 to RV-03 |
| Full invitation flow | IF-01 to IF-05 |
