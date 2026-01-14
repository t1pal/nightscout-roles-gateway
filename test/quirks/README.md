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
- Test SL-05 is marked as skipped because the unique constraint prevents creating the test scenario
- This is a critical security/integrity feature, not a limitation

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
