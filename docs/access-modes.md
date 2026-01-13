# Access Modes

NRG supports three orthogonal access conditions for registered Nightscout sites. These modes can be configured independently to create flexible access policies.

## Overview

| Mode | Description | Use Case |
|------|-------------|----------|
| **A: Anonymous/Public** | Site available to anyone at vanity URL | Standard Nightscout sharing |
| **B: Identity-Mapped** | Requires login with consent logging | Controlled sharing with audit trail |
| **C: Legacy Escape Hatch** | API secret bypasses login | Uploader devices and legacy apps |

## Mode A: Anonymous/Public Access

The site is available at its vanity URL (e.g., `yoursite.gateway.example.com`) for anyone who has the link.

### Behavior

- No login required to visit the site
- Standard Nightscout authentication applies:
  - Public data visible without authentication
  - API secret or token required for privileged operations (treatments, careportal, etc.)
- Same behavior as a traditional self-hosted Nightscout

### Configuration

- Set `require_identities: false` on the site registration
- Default policy allows anonymous access

### Example Use Cases

- Personal CGM sharing with family via link
- Public marathon glucose display during events
- Simple "anyone with the link can view" sharing

## Mode B: Identity-Mapped Access

Visitors must be logged in through the identity provider, and their access is logged with consent.

> **Detailed documentation**: See [Policies and Permissions](./policies-and-permissions.md) for complete details on groups, connection policies, schedules, and the consent flow.

### Behavior

- Visitor must authenticate via OAuth (ORY Kratos/Hydra)
- Visitor consents to being recorded in the usage log
- User identities or groups can be mapped to Nightscout authorization tokens (nsjwt shiros)
- Access permissions can be scheduled on a weekly basis

### Configuration

- Set `require_identities: true` on the site registration
- Define groups with inclusion specifications (`group_inclusion_specs`)
- Map groups to policies with specific permission types
- Optionally configure schedules for time-based access

### Identity Types

Groups can be defined by various identity traits:

| Identity Type | Implementation Status | Description |
|---------------|----------------------|-------------|
| `email` | **Implemented** | Exact match after lowercase normalization |
| `anonymous` | **Implemented** | Any visitor (default audience groups) |
| `organization` | Planned | Organization membership claims |
| `subject` | Planned | Specific user IDs |

### Policy Types

| Policy Type | Description |
|-------------|-------------|
| `default` | Standard allow/deny based on `policy_spec` value |
| `nsjwt` | Exchange with Nightscout to inject shiro/JWT token with specific permissions |

### Scheduled Access

Policies can include schedules that define when access is permitted:

- `schedule_nickname`: Human-readable name (e.g., "School Hours")
- `fill_pattern`: Comma-separated permission specs (e.g., `"deny,allow,deny"`)
- `schedule_segments`: Comma-separated offsets in seconds since start of week

```javascript
{
  schedule_nickname: "Tuesday Afternoon",
  fill_pattern: "deny,allow,deny",
  schedule_segments: "0,226800,244800"  // 3 segments = 3 fill patterns
}
```

**Note**: The number of fill pattern entries should match the number of segments for predictable behavior. See [Policies and Permissions - Scheduled Policies](./policies-and-permissions.md#scheduled-policies) for detailed examples including school hours and weekend access patterns.

### Example Use Cases

- School nurse access during school hours only
- Healthcare provider access with audit logging
- Babysitter access for specific weekends
- Social sharing with consent (Twitter friends, Facebook groups)

## Mode C: Legacy Device Escape Hatch

Allows devices using the correct API secret to bypass login requirements while identity features remain active for web visitors.

### Behavior

- Requests with a valid `API-SECRET` header matching the registered site's secret are allowed through
- No login required for these requests
- Identity-based access continues to apply for visitors without API secret
- Enables legacy uploaders and mobile apps to function normally

### Configuration

- Set `exempt_matching_api_secret: true` on the site registration
- The API secret must be registered with the site

### How It Works

1. Request arrives with `API-SECRET` header
2. System hashes the provided secret and compares to `nightscout_secrets` table
3. If match found and `exempt_matching_api_secret` is true, access is granted
4. The request proceeds without identity verification

### Example Use Cases

- xDrip+ or other uploaders pushing CGM data
- AAPS or Loop uploading treatments
- Legacy mobile apps that predate OAuth support
- BYOD (Bring Your Own Device) scenarios where user's devices should represent them as owner

## Combining Modes

The modes are orthogonal and can be combined:

| Configuration | Behavior |
|---------------|----------|
| A only | Traditional Nightscout, anyone can view |
| B only | Login required for everyone, no legacy support |
| B + C | Login required for web visitors, uploaders work with API secret |
| A + C | Anonymous visitors allowed; API secret devices also allowed (useful when you want both public access AND explicit device authentication for uploaders) |

## Policy Decision Flow

The Warden endpoints evaluate access through the `decision()` function in this order:

```
1. Is site enabled? (is_enabled)
   └─ No → 403 Forbidden (immediate return)

2. Is strictly_nightscout mode on? (env.upstream.strictly_nightscout)
   └─ Yes → Also check nightscout authenticity (acceptable)
      └─ Not acceptable → 403 Forbidden (immediate return)

--- At this point, if still active, evaluation continues: ---

3. Does request have matching API secret? (allow_for_matching_api_secret)
   └─ Yes → active = true (Mode C escape hatch)
   └─ No → Continue to step 4

4. Does site require identities? (require_identities)
   └─ No → active remains true (Mode A - anonymous allowed)
   └─ Yes → Check ACL for user's identity
      └─ ACL policy_spec == 'allow' → active = true (Mode B)
      └─ No matching ACL → active = false

5. Is nsjwt token mode active?
   └─ ACL policy_type == 'nsjwt' + valid token → active = true

6. Final decision
   └─ active == true → Allow, set x-upstream-origin header
   └─ active == false → 403 Forbidden
```

**Note**: The API secret check (step 3) is evaluated BEFORE identity requirements (step 4), providing the escape hatch for legacy devices even when identity mode is enabled.

## Related Database Tables

| Table | Purpose |
|-------|---------|
| `registered_sites` | Site configuration including `require_identities`, `exempt_matching_api_secret` |
| `group_definitions` | Group definitions owned by users |
| `group_inclusion_specs` | Identity matching rules for groups (Roles) |
| `connection_policies` | Policies linking sites to groups with permission types |
| `scheduled_policies` | Time-based access schedules |
| `nightscout_secrets` | Hashed API secrets for Mode C verification |

## Code Location

- `lib/policies/index.js` - Policy evaluation and decision logic
- `lib/routes.js` - Warden endpoint mounting
