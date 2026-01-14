# Proposal: Expanding Group Inclusion Traits

**Status:** Draft  
**Created:** January 2026  
**Author:** NRG Team

---

## Problem Statement

Currently, group membership can only be defined by:
- **Exact email match** - requires listing every individual email
- **Anonymous** - matches any/all visitors

This creates friction when:
- An organization has 50 nurses and you need to add each email manually
- Partner organizations (clinics, schools) want to onboard their whole staff
- Membership changes at the source (someone gets hired/fired) but your system doesn't reflect it

---

## Proposed Identity Types

### 1. Email Domain Wildcard (`email_domain`)

**Spec format:** `@lincoln-elementary.edu`

**Matching logic:** Check if user's email ends with the domain

**Use case:** "Anyone with a verified school email can view this student's care plan"

**Trust level:** Medium - relies on email domain ownership

**Implementation complexity:** Low - simple string suffix match

---

### 2. Organization Membership (`organization`)

**Spec format:** `org:lincoln-clinic` or just `lincoln-clinic`

**Matching logic:** Check if user's Kratos identity has an `organization` trait matching the spec

**Use case:** "All Lincoln Clinic staff can add notes"

**Trust level:** High - organization is set during user onboarding, potentially by admin

**Implementation complexity:** Medium - requires:
- Adding `organization` trait to Kratos identity schema
- Workflow for how organizations are assigned (admin invite? domain verification?)

**Kratos schema addition:**
```json
{
  "traits": {
    "email": "...",
    "organization": "lincoln-clinic"
  }
}
```

---

### 3. Subject ID (`subject`)

**Spec format:** Kratos identity UUID (e.g., `a1b2c3d4-...`)

**Matching logic:** Direct match on `req.user.id`

**Use case:** Granting access to a specific person regardless of email changes

**Trust level:** Very high - immutable identifier

**Implementation complexity:** Very low - already have the ID

---

### 4. Role-based (`role`)

**Spec format:** `role:nurse` or `role:caregiver`

**Matching logic:** Check user's `role` trait

**Use case:** "Any verified nurse can view clinical notes"

**Trust level:** Depends on how roles are assigned

**Implementation complexity:** Medium - same pattern as organization

---

### 5. External Group Reference (`external_group`)

**Spec format:** `google-group:nurses@lincoln.edu` or `slack:C12345`

**Matching logic:** OAuth call to external provider to verify membership

**Use case:** "Anyone in this Google Group can access"

**Trust level:** Delegated to external provider

**Implementation complexity:** High
- Requires OAuth integration per provider
- Membership can be stale (need refresh strategy)
- Rate limits and API costs

**Recommendation:** Defer this unless there's strong demand. The complexity is significant and organization-based matching covers most enterprise use cases.

---

## Recommended Priority

| Priority | Type | Effort | Value |
|----------|------|--------|-------|
| 1 | `email_domain` | Low | High - immediate pain relief |
| 2 | `subject` | Very Low | Medium - already designed for |
| 3 | `organization` | Medium | High - enables partner workflows |
| 4 | `role` | Medium | Medium - natural extension of org |
| 5 | `external_group` | High | Low - niche use cases |

---

## Trusted Partner Model

When a clinic becomes a trusted partner:

1. **Assign them an organization ID** (e.g., `lincoln-clinic`)
2. **Their admin can invite users** who automatically get that org trait
3. **Groups can include** `organization: lincoln-clinic` as an inclusion spec
4. **Staff changes** at the clinic are reflected immediately - no manual email updates needed

This creates a clean delegation model: you trust the clinic to manage their own staff.

---

## Implementation Notes

### Database Changes

The existing `group_inclusion_specs` table already supports new identity types - no schema migration needed:

```
identity_type: 'email_domain'
identity_spec: '@lincoln-elementary.edu'
```

### Matching Logic Updates

The matching logic in the authorization layer needs to be extended to handle new types:

```javascript
function matchesInclusionSpec(user, spec) {
  switch (spec.identity_type) {
    case 'email':
      return normalizeEmail(user.traits.email) === normalizeEmail(spec.identity_spec);
    
    case 'email_domain':
      return user.traits.email.toLowerCase().endsWith(spec.identity_spec.toLowerCase());
    
    case 'subject':
      return user.id === spec.identity_spec;
    
    case 'organization':
      return user.traits.organization === spec.identity_spec;
    
    case 'role':
      return user.traits.role === spec.identity_spec;
    
    case 'anonymous':
      return true;
    
    default:
      return false;
  }
}
```

### Kratos Schema Updates

For `organization` and `role` types, the Kratos identity schema needs to include these traits:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email"
        },
        "organization": {
          "type": "string",
          "description": "Organization identifier for trusted partner membership"
        },
        "role": {
          "type": "string",
          "enum": ["nurse", "physician", "caregiver", "admin"],
          "description": "Professional role for role-based access"
        }
      },
      "required": ["email"]
    }
  }
}
```

---

## Open Questions

1. **Should organization traits be multi-valued?** (user belongs to multiple orgs)
2. **Who can assign organization membership?** (self-claim vs admin-only)
3. **Should we support wildcards in roles?** (e.g., `role:*` for any verified professional)
4. **Email domain verification:** Should we verify domain ownership before trusting `email_domain` rules?

---

## Next Steps

1. Implement `email_domain` matching (quick win)
2. Implement `subject` matching (very low effort)
3. Design organization onboarding workflow
4. Update Kratos schema for `organization` trait
5. Implement `organization` matching
6. Document new identity types in API docs

---

## Related Documentation

- [Policies and Permissions](./policies-and-permissions.md)
- [Architecture Overview](./ARCHITECTURE.md)
