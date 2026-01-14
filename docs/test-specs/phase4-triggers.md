# Test Specification: Phase 4 - PostgreSQL Triggers

This document specifies the expected behaviors for PostgreSQL triggers that enforce business rules and maintain data integrity at the database level.

## Overview

PostgreSQL triggers provide:
1. **Security enforcement** - Secret hashing, validation
2. **Data integrity** - Cascade cleanup, constraint enforcement
3. **Automation** - Auto-ID generation, sort order initialization

---

## 1. Secret Hashing (`sync_hashed_api_secret`)

### Trigger Configuration

- **Table**: `registered_sites`
- **Events**: `BEFORE INSERT OR DELETE`, `BEFORE UPDATE` (when `api_secret` changes)
- **Function**: `sync_hashed_api_secret()`
- **Target Table**: `nightscout_secrets`

### INSERT Behavior

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| TRG-HS-01 | Site INSERT with api_secret | `api_secret: 'my-secret'` | `nightscout_secrets` record created with SHA1 hash |
| TRG-HS-02 | Plaintext clearing | `api_secret: 'my-secret'` | `registered_sites.api_secret` set to `''` |
| TRG-HS-03 | NULL api_secret | `api_secret: null` | `nightscout_secrets` record still created |
| TRG-HS-04 | Empty string api_secret | `api_secret: ''` | Record created with hash of empty string |

### UPDATE Behavior

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| TRG-HS-05 | api_secret changes | UPDATE with new secret | `hashed_api_secret` updated to new hash |
| TRG-HS-06 | Non-secret field changes | UPDATE nickname only | Trigger does NOT fire (WHEN clause) |
| TRG-HS-07 | Plaintext clearing on UPDATE | UPDATE api_secret | `registered_sites.api_secret` set to `''` |
| TRG-HS-08 | UPDATE to NULL | `api_secret: null` | Record updated, hash may be null |

### DELETE Behavior

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-HS-09 | Site DELETE | `nightscout_secrets` record deleted |

### Hash Verification

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-HS-10 | SHA1 hash consistency | PostgreSQL `digest(..., 'sha1')` matches Node.js `crypto.createHash('sha1')` |
| TRG-HS-11 | Max-length secret (255 chars) | Hash computed correctly |
| TRG-HS-14 | Secret > 255 chars | INSERT rejected (column limit) |

### Security Properties

| ID | Property | Verified By |
|----|----------|-------------|
| TRG-HS-12 | No plaintext in registered_sites | Check all rows have empty `api_secret` |
| TRG-HS-13 | Separate secrets table | Hash stored in `nightscout_secrets` only |

---

## 2. Cascade Cleanup Triggers

### `remove_joined_groups_via_policy`

- **Table**: `connection_policies`
- **Event**: `AFTER DELETE`
- **Effect**: Deletes `joined_groups` where `policy_id` matches

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-CC-01 | Policy deleted | All `joined_groups` with that `policy_id` deleted |
| TRG-CC-02 | Policy A deleted | Only policy A's `joined_groups` removed, policy B's remain |
| TRG-CC-03 | Policy with no joined_groups | Delete succeeds, no side effects |

### `force_leave_group`

- **Table**: `group_inclusion_specs`
- **Event**: `AFTER DELETE`
- **Effect**: Deletes `joined_groups` where `group_spec_id` matches

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-CC-04 | Inclusion spec deleted | All `joined_groups` with that `group_spec_id` deleted |
| TRG-CC-05 | Spec A deleted | Only spec A's `joined_groups` removed, spec B's remain |
| TRG-CC-06 | Spec with multiple users | All users' `joined_groups` for that spec deleted |

### Cascade Chain

| ID | Scenario | Observed Behavior |
|----|----------|-------------------|
| TRG-CC-07 | Group definition deleted | Inclusion specs cascade-deleted, triggering `force_leave_group` |

---

## 3. Reserved Name Validation (`check_site_reserved_name`)

### Trigger Configuration

- **Table**: `registered_sites`
- **Events**: `BEFORE INSERT`, `BEFORE UPDATE` (when `expected_name` changes)
- **Function**: `check_site_reserved_name()`
- **Reference Table**: `reserved_expected_names`

### INSERT Validation

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-RN-01 | Non-reserved name | INSERT succeeds |
| TRG-RN-02 | Exact reserved name | EXCEPTION raised: "cannot be a reserved name" |
| TRG-RN-03 | Pattern match (e.g., `api%`) | EXCEPTION raised |
| TRG-RN-04 | Similar but non-matching | INSERT succeeds |

### UPDATE Validation

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-RN-05 | UPDATE to reserved name | EXCEPTION raised |
| TRG-RN-06 | Non-name field UPDATE | No validation (WHEN clause) |
| TRG-RN-07 | UPDATE to new valid name | UPDATE succeeds |

### Auto-ID Generation (`hash_id_reservation`)

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-RN-08 | INSERT without ID | SHA1 hash of `reserved_name` used as ID |
| TRG-RN-09 | INSERT with explicit ID | Provided ID preserved |

### Pattern Matching

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-RN-10 | SQL SIMILAR TO patterns | `(www|cdn|api)%` blocks `www-site`, `cdn-assets`, `api-v1` |
| TRG-RN-11 | Empty reserved table | All names allowed |
| TRG-RN-12 | Multiple patterns | Any matching pattern blocks |

---

## 4. Sort Order Initialization (`initialize_connection_policy_sort`)

### Trigger Status

**QUIRK**: This trigger is **NOT INSTALLED** in the current schema.

Migration `20220508223845` contains `return Promise.resolve(true);` at the start, which bypasses the trigger creation.

### Expected Behavior (if installed)

| ID | Scenario | Expected |
|----|----------|----------|
| TRG-SO-01 | First policy on site | `sort = 0` |
| TRG-SO-02 | Subsequent policies | `sort` increments |
| TRG-SO-03 | Independent per site | Each site starts at 0 |
| TRG-SO-04 | Explicit sort provided | Trigger does not override |

### Actual Behavior (quirk)

| ID | Scenario | Actual |
|----|----------|--------|
| TRG-SO-01 | First policy on site | `sort = NULL` |
| TRG-SO-02 | Subsequent policies | `sort = 1, 2, ...` (counts existing) |
| TRG-SO-03 | Independent per site | First per site is NULL |

### Workaround

The `fixtures.createPolicy()` helper and explicit `sort` values in test data ensure consistent behavior despite the missing trigger.

---

## 5. Test File Organization

```
test/triggers/
├── sync_hashed_api_secret.test.js  # TRG-HS-01 to TRG-HS-14
├── cascade_cleanup.test.js          # TRG-CC-01 to TRG-CC-07
├── reserved_validation.test.js      # TRG-RN-01 to TRG-RN-12
└── sort_order.test.js               # TRG-SO-01 to TRG-SO-06
```

---

## 6. Running Trigger Tests

```bash
# Run all trigger tests
NODE_ENV=test npm test -- --grep "Trigger:"

# Run specific trigger category
NODE_ENV=test npm test -- --grep "sync_hashed_api_secret"
NODE_ENV=test npm test -- --grep "Cascade Cleanup"
NODE_ENV=test npm test -- --grep "Reserved Name"
NODE_ENV=test npm test -- --grep "initialize_connection_policy_sort"
```

---

## Appendix: Coverage Mapping

| Trigger Function | Spec IDs | Tests |
|-----------------|----------|-------|
| `sync_hashed_api_secret()` | TRG-HS-01 to TRG-HS-14 | 15 |
| `remove_joined_groups_via_policy()` | TRG-CC-01 to TRG-CC-03 | 3 |
| `force_leave_group()` | TRG-CC-04 to TRG-CC-07 | 4 |
| `check_site_reserved_name()` | TRG-RN-01 to TRG-RN-12 | 12 |
| `hash_id_reservation()` | TRG-RN-08, TRG-RN-09 | 2 |
| `initialize_connection_policy_sort()` | TRG-SO-01 to TRG-SO-06 | 6 |

**Total**: 39 trigger tests

---

## Appendix: Discovered Quirks

### TRG-SO-Q01: Sort order trigger not installed

**Status**: Observed, documented  
**Description**: Migration 20220508223845 has `return Promise.resolve(true);` which bypasses trigger creation. First policy per site gets NULL sort.

**Impact**: Applications must provide explicit sort values or handle NULL in first-match logic.

### TRG-HS-Q01: api_secret column limit

**Status**: By design  
**Description**: The `api_secret` column is `varchar(255)`. Secrets longer than 255 characters are rejected by PostgreSQL.

**Impact**: API secret validation should enforce maximum length client-side.
