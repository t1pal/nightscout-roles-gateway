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

### SPVA-Q01: Timezone handling uses database server time

**View**: `site_policy_schedules_active`  
**Status**: By design  
**Description**: The active schedule filtering uses the PostgreSQL server's time (`CURRENT_TIMESTAMP`), not client-provided time. This means:

- All schedule evaluations are relative to server timezone
- Clients in different timezones see schedules based on server time
- UTC is typically used in cloud deployments

**Impact**: Schedule windows may not align with user's local time expectations.

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

## Adding New Quirks

Use this template:

```markdown
### [QUIRK-ID]: [Brief title]

**View/Table**: [affected database object]  
**Status**: [Observed/By design/Fixed in X]  
**Description**: [What happens and when]

**Impact**: [What this means for users/developers]
```
