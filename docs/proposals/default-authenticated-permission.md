# Proposal: Default Authenticated Permission

**Status**: Draft  
**Created**: 2026-01-14  
**Author**: System Analysis  

## Problem Statement

When `require_identities` is enabled (Mode B), the current implementation conflates two distinct concepts:

1. **Authentication requirement** - Users must log in
2. **Explicit mapping requirement** - Users must have a specific group/policy mapping

Currently, if a user is authenticated but has no explicit ACL mapping, they are denied access (403 Forbidden). This creates a gap in the access control model where site owners cannot express:

> "Require login for audit/consent purposes, but grant a default permission level to authenticated users without explicit mappings."

## Current Behavior Analysis

### Decision Logic (`lib/policies/index.js`)

```javascript
if (res.locals.policy.require_identities) {
  res.locals.policy_allow_authorized_use = (res.locals.acl && res.locals.acl.policy_spec == 'allow');
  active = res.locals.policy_allow_authorized_use;
}
```

This logic produces the following outcomes:

| User State | ACL Status | `policy_spec` | Result |
|------------|------------|---------------|--------|
| Anonymous | N/A | N/A | 403 Forbidden |
| Authenticated | No ACL | N/A | 403 Forbidden |
| Authenticated | Has ACL | `deny` | 403 Forbidden |
| Authenticated | Has ACL | `allow` | Access granted |

### The Gap

There is no mechanism to express "authenticated but unmapped users get X permission level."

The `anonymous` identity type in `group_inclusion_specs` does not solve this because:
1. It creates an *explicit* mapping, not a fallback
2. It matches *any visitor*, not specifically "authenticated users without other mappings"
3. It conflates "public anonymous" with "authenticated but unmapped"

## Use Cases

### Use Case 1: Audit-Only Mode

A parent wants to:
- Require login so all visitors are identified and logged
- Allow anyone who logs in to view (read-only)
- Not manage individual mappings for every viewer

Current workaround: Create an `anonymous` identity type group with `allow` - but this defeats the purpose of `require_identities` since anonymous users could also match.

### Use Case 2: Tiered Access with Safe Default

A clinic shares a patient's Nightscout with:
- Healthcare providers: Full careportal access (explicit mapping with nsjwt)
- Family members: Read-only (explicit mapping)
- Anyone else who logs in: Blocked (default for unmapped)

Currently achievable, but only because "blocked" is the hardcoded default. There's no way to flip this to "read-only" as the safe default.

### Use Case 3: School Nurse Scenario

A school wants:
- School nurse: Careportal access during school hours (scheduled policy)
- Teachers: Read-only access (explicit mapping)
- Any authenticated school staff: Read-only (default for authenticated)
- Anonymous: Blocked

Currently impossible - authenticated-but-unmapped staff get blocked, not read-only.

## Proposed Solution

### New Configuration: `default_authenticated_permission`

Add a new column to `registered_sites` that specifies the fallback permission for authenticated users without explicit ACL mappings.

#### Schema Change

```sql
ALTER TABLE registered_sites 
ADD COLUMN default_authenticated_permission VARCHAR(20) DEFAULT 'deny';
```

Valid values:
- `deny` (default) - Current behavior; unmapped authenticated users are blocked
- `allow` - Unmapped authenticated users get full access
- `readonly` - Unmapped authenticated users get read-only access (future: maps to a minimal nsjwt role)

### Updated Decision Logic

The current authentication flow uses the `kratos_whoami` middleware (in `lib/privy/index.js`) which:
1. Calls Kratos to validate the session cookie
2. Sets `req.user` and `res.locals.identity` with the user's identity data
3. On failure, sets `req.user` to a minimal object with `id: 'anonymous'`

The updated decision logic in `lib/policies/index.js`:

```javascript
if (res.locals.policy.require_identities) {
  if (res.locals.acl && res.locals.acl.policy_spec) {
    // Explicit mapping takes precedence
    res.locals.policy_allow_authorized_use = (res.locals.acl.policy_spec == 'allow');
    active = res.locals.policy_allow_authorized_use;
  } else if (req.user && req.user.id && req.user.id !== 'anonymous') {
    // No explicit mapping, but user is authenticated via Kratos - apply default
    var defaultPerm = res.locals.policy.site.default_authenticated_permission || 'deny';
    res.locals.policy_allow_authorized_use = (defaultPerm == 'allow' || defaultPerm == 'readonly');
    res.locals.policy_permission_level = defaultPerm;
    active = res.locals.policy_allow_authorized_use;
  } else {
    // Not authenticated (anonymous or no session)
    active = false;
  }
}
```

### Decision Matrix (Updated)

| User State | ACL Status | `policy_spec` | `default_authenticated_permission` | Result |
|------------|------------|---------------|-----------------------------------|--------|
| Anonymous | N/A | N/A | Any | 403 Forbidden |
| Authenticated | No ACL | N/A | `deny` | 403 Forbidden |
| Authenticated | No ACL | N/A | `allow` | Access granted |
| Authenticated | No ACL | N/A | `readonly` | Read-only access |
| Authenticated | Has ACL | `deny` | Any | 403 Forbidden |
| Authenticated | Has ACL | `allow` | Any | Access granted |

### Key Behaviors

1. **Explicit mappings always win** - If a user has an ACL entry, that determines their access regardless of the default setting.

2. **Default only applies to authenticated users** - Anonymous users are still blocked when `require_identities = true`.

3. **Backward compatible** - Default value of `deny` preserves current behavior.

4. **Distinct from `anonymous` identity type** - The `anonymous` identity type creates explicit mappings; this setting handles the fallback case.

## Implementation Considerations

### Phase 1: Basic Implementation

1. Add `default_authenticated_permission` column to `registered_sites`
2. Update `decision()` function in `lib/policies/index.js`
3. Expose in owner management API for site configuration
4. Update documentation

### Phase 2: Read-Only Enforcement (Future)

For `readonly` to be meaningful, the system needs to:
1. Define what "read-only" means at the Nightscout level
2. Either generate a minimal nsjwt token or enforce via proxy rules
3. This may require upstream Nightscout coordination

### Migration

No data migration required - new column with default value preserves existing behavior.

## Alternatives Considered

### Alternative 1: Special "authenticated" Identity Type

Create a new identity type `authenticated` that matches any logged-in user, usable in `group_inclusion_specs`.

**Pros**: Uses existing group/policy machinery  
**Cons**: 
- Adds complexity to group matching logic
- Requires users to explicitly create this group
- Order-of-evaluation with other groups becomes confusing

### Alternative 2: Catch-All Group

Allow a group with `identity_type = '*'` or `identity_type = 'fallback'` that matches when nothing else does.

**Pros**: Flexible  
**Cons**:
- Overloads the group concept
- Harder to reason about than a site-level setting

## Open Questions

1. Should `readonly` be a supported value from day one, or should we start with just `deny`/`allow`?

2. How does this interact with scheduled policies? Should the default permission be schedule-aware?

3. Should there be separate defaults for "authenticated but unmapped" vs "authenticated with explicit deny"?

## Relationship to Existing Modes

This proposal extends Mode B (Identity-Mapped Access) without changing Modes A or C:

```
Mode A: require_identities = false → Anyone can view
Mode B: require_identities = true
        └─ Explicit ACL match → Use ACL policy_spec
        └─ No ACL match, authenticated → Use default_authenticated_permission
        └─ Not authenticated → 403 Forbidden
Mode C: API-SECRET bypass → Unchanged
```

## References

- `docs/access-modes.md` - Current access mode documentation
- `docs/ARCHITECTURE.md` - Decision flow documentation
- `lib/policies/index.js` - Current implementation
- `docs/policies-and-permissions.md` - Group and policy documentation
