# Privy: Identity and Access Verification

The Privy module answers the fundamental question: **"Is this person privy to this information?"** It manages identity verification, group membership, and consent tracking for the Nightscout Roles Gateway.

## Overview

When a user attempts to access a protected Nightscout site, NRG must determine:

1. **Who is this person?** (Identity resolution via Ory Kratos)
2. **Were they invited?** (Group inclusion specification matching)
3. **Did they consent to the access terms?** (Joined groups record)

Privy provides the APIs and logic to answer these questions at runtime.

## Consent Model

When a user accepts an invitation (RSVP) to join a group, they consent to two things:

| Consent Element | Description |
|-----------------|-------------|
| **View Access** | The user will be viewing Nightscout health data |
| **Audit Trail** | The Nightscout owner will see who visited and when |

This mutual transparency benefits everyone:
- **Owners** can see that "Mom" visited and what actions she took
- **Followers** have a clear record of their access
- **Accountability** discourages unauthorized sharing of access credentials

## Data Model

### The `site_acls` View

The `site_acls` view is a denormalized projection that joins the complete access control chain:

```
registered_sites
    └── connection_policies
            ├── group_definitions
            │       └── group_inclusion_specs
            └── scheduled_policies
```

**Key Fields:**

| Field | Source | Description |
|-------|--------|-------------|
| `id` | registered_sites | Site ID |
| `owner_ref` | registered_sites | Owner identity reference |
| `expected_name` | registered_sites | Vanity hostname prefix |
| `upstream_origin` | registered_sites | Actual Nightscout URL |
| `require_identities` | registered_sites | Whether Mode B (identity-mapped) is enforced |
| `exempt_matching_api_secret` | registered_sites | Whether Mode C (legacy escape hatch) is enabled |
| `group_id` | group_definitions | Group ID |
| `group_name` | group_definitions | Human-readable group name |
| `group_deny_access` | group_definitions | If true, group denies rather than grants access |
| `group_spec_id` | group_inclusion_specs | Inclusion specification ID |
| `identity_type` | group_inclusion_specs | Type of identity (e.g., `email`) |
| `identity_spec` | group_inclusion_specs | The actual identity value (e.g., `alice@example.com`) |
| `policy_id` | connection_policies | Policy ID |
| `policy_name` | connection_policies | Human-readable policy name |
| `policy_type` | connection_policies | Permission type granted |
| `policy_spec` | connection_policies | Additional policy configuration |
| `schedule_id` | scheduled_policies | Schedule ID (nullable) |
| `schedule_type` | scheduled_policies | Type of schedule |
| `fill_pattern` | scheduled_policies | Default behavior outside schedule |
| `schedule_segments` | scheduled_policies | Time-based access windows |

### The `joined_groups` Table

Records when a user accepts an invitation and consents to access terms.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique record ID |
| `subject` | string | Kratos identity ID of the consenting user |
| `expected_name` | string | Vanity hostname of the site being accessed |
| `group_id` | string | The group being joined |
| `group_spec_id` | string | The specific inclusion spec that matched |
| `policy_id` | string | The policy granting access |

**Lifecycle:**
- **Created** when user accepts an invitation (POST to joined groups)
- **Deleted** when user revokes consent (DELETE from joined groups)

## Identity Integration

### Current Implementation

Privy integrates with **Ory Kratos** for identity management:

```javascript
var Kratos = require('@ory/kratos-client');
var sdk = new Kratos.V0alpha2Api(new Kratos.Configuration({
  basePath: opts.kratos.api
}));
```

**Supported Identity Types (Current):**
- Email/password authentication
- Google OAuth

**Identity Resolution Methods:**

| Method | Use Case |
|--------|----------|
| `adminGetIdentity(id)` | Backend lookup of identity by ID |
| `toSession(cookie)` | Resolve current user from session cookie |

### Anonymous Fallback

When session resolution fails (401), Privy provides an anonymous identity:

```javascript
req.user = {
  id: 'anonymous',
  traits: {
    email: '*'
  }
};
```

This allows the Warden to continue evaluating access for Mode A (public) sites.

### Future: Extended Identity Providers

The architecture is designed to support additional identity providers:

| Provider Type | Status | Notes |
|---------------|--------|-------|
| Email/Password | Implemented | Primary authentication method |
| Google OAuth | Implemented | Social login |
| Phone/SMS | Planned | Meet users where they are |
| Additional Social | Planned | Facebook, Apple, etc. |
| SAML/Enterprise SSO | Considered | For organizational deployments |

The `identity_type` field in `group_inclusion_specs` allows matching against different identity attributes beyond email.

## Invitation Flow

### Step 1: Owner Creates Invitations

Via the Control Panel, an owner adds email addresses to a group:

```
POST /api/v1/objects/Role
{
  "group_definition_id": "grp_abc123",
  "identity_type": "email",
  "identity_spec": "mom@example.com",
  "nickname": "Mom"
}
```

This creates a `group_inclusion_spec` record. The email is normalized to lowercase.

### Step 2: User Logs In and Sees Pending Invitations

When a user logs into the WWW Viewer, their available invitations are fetched:

```
GET /api/v1/privy/:identity/groups/available
```

The query matches:
- `identity_type = 'email'`
- `identity_spec = user's email` (from Kratos traits)

The response includes invitations that:
- Match the user's email
- Optionally filtered by `join_spec`:
  - `join_spec=available` - Not yet accepted
  - `join_spec=joined` - Already accepted

### Step 3: User Accepts Invitation

User clicks "Accept" in the viewer:

```
POST /api/v1/privy/:identity/groups/joined
{
  "group_id": "grp_abc123",
  "group_spec_id": "spec_xyz789",
  "policy_id": "pol_def456",
  "expected_name": "bens-nightscout"
}
```

This creates a `joined_groups` record linking the user's `subject` (Kratos identity ID) to the group.

### Step 4: Access Is Granted

The Warden authorization chain now finds a matching `joined_groups` record when evaluating the user's access, and grants entry.

## API Reference

### Identity Resolution

#### `GET /api/v1/privy/:identity/`

Fetch identity details from Kratos and return them via the standard response wrapper.

**Parameters:**
- `identity` (path) - Kratos identity ID

**Response:** 
```json
{
  "identity": {
    "id": "kratos-uuid",
    "traits": {
      "email": "user@example.com",
      "name": { ... }
    }
  }
}
```

**Note:** This endpoint uses the `privy_id` handler which resolves the identity via Kratos `adminGetIdentity()` and stages it in `res.locals.identity`. The standard `locals_results` formatter then emits the response.

---

### Available Invitations

#### `GET /api/v1/privy/:identity/groups/available`

List all pending invitations for a user.

**Parameters:**
- `identity` (path) - Kratos identity ID
- `join_spec` (query, optional) - Filter: `joined` or `available`
- `perPage`, `currentPage` (query, optional) - Pagination

**Response:** Paginated list of matching ACL records with join status.

#### `GET /api/v1/privy/:identity/groups/available/:expected_name`

List invitations for a specific site.

**Additional Parameters:**
- `expected_name` (path) - Site vanity hostname

#### `GET /api/v1/privy/:identity/groups/available/details/:group_id`

Get invitation details for a specific group.

**Additional Parameters:**
- `group_id` (path) - Group ID

#### `GET /api/v1/privy/:identity/consents/available/:client_id`

List invitations by OAuth client ID.

**Additional Parameters:**
- `client_id` (path) - OAuth client ID from Hydra

---

### Joined Groups (Consent Records)

#### `POST /api/v1/privy/:identity/groups/joined`

Accept an invitation and record consent.

**Parameters:**
- `identity` (path) - Kratos identity ID

**Required Body Fields:**
```json
{
  "group_id": "string",
  "group_spec_id": "string", 
  "policy_id": "string",
  "expected_name": "string"
}
```

All four fields are required. These values should be obtained from the invitation response when calling `GET /groups/available` - the API returns these fields as part of the ACL record.

**Response:** The created `joined_groups` record with the user's `subject` (Kratos identity ID) populated.

#### `GET /api/v1/privy/:identity/groups/joined`

List all groups the user has joined.

**Parameters:**
- `identity` (path) - Kratos identity ID

**Response:** List of `joined_groups` records.

#### `GET /api/v1/privy/:identity/groups/joined/:group_id`

Get a specific joined group record.

#### `DELETE /api/v1/privy/:identity/groups/joined/:group_id`

Revoke consent and leave a group.

**Parameters:**
- `identity` (path) - Kratos identity ID
- `group_id` (path) - Group ID to leave

**Required Query/Body Parameters:**
The delete operation also requires `group_spec_id`, `policy_id`, and `expected_name` to uniquely identify the membership record. These can be passed as query parameters or in the request body.

**Response:** 204 No Content

---

### Warden Integration

#### `kratos_whoami` Handler

Used in the Warden authorization chain to resolve the current user from session cookies:

```
GET/HEAD /warden/v1/active/backend/for/:expected_name
```

This handler is part of the authorization pipeline, not a standalone endpoint.

---

### Activity Log (Planned)

#### `GET /api/v1/privy/:identity/activity/log`

**Status:** Not yet implemented (stub endpoint)

**Current Behavior:** Returns an empty response. Integrators should expect no meaningful payload until this feature is implemented.

**Planned Behavior:** Return a log of the user's access activities, including:
- Sites visited
- Access timestamps
- Actions taken (views, treatments, etc.)

## Activity Logging Specification (Future)

### Purpose

Activity logging provides transparency and accountability for both owners and followers:

- **Owners** can see who accessed their Nightscout and when
- **Followers** can review their own access history
- **Compliance** requirements may mandate audit trails

### Proposed Event Types

| Event | Description | Captured Data |
|-------|-------------|---------------|
| `access.granted` | User was granted access via Warden | site, identity, timestamp, policy_id |
| `access.denied` | User was denied access | site, identity, timestamp, reason |
| `consent.accepted` | User joined a group | site, identity, group_id, timestamp |
| `consent.revoked` | User left a group | site, identity, group_id, timestamp |
| `view.nightscout` | User viewed Nightscout data | site, identity, timestamp, path |

### Proposed Schema

```sql
CREATE TABLE activity_log (
  id VARCHAR PRIMARY KEY,
  event_type VARCHAR NOT NULL,
  subject VARCHAR NOT NULL,        -- Kratos identity ID
  owner_ref VARCHAR,               -- Site owner (for owner queries)
  expected_name VARCHAR,           -- Site vanity name
  details JSONB,                   -- Event-specific data
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_subject ON activity_log(subject);
CREATE INDEX idx_activity_owner ON activity_log(owner_ref);
CREATE INDEX idx_activity_site ON activity_log(expected_name);
```

### Access Patterns

| Query | Use Case |
|-------|----------|
| By subject | "What have I accessed?" (follower view) |
| By owner_ref | "Who accessed my sites?" (owner view) |
| By expected_name | "Who accessed this specific site?" |

## Testing Considerations

### Core Scenarios to Test

| Scenario | Description |
|----------|-------------|
| **Happy Path Invitation** | Owner invites email → User logs in → Sees invitation → Accepts → Access granted |
| **Email Normalization** | Invitations with mixed-case emails should match lowercase user emails |
| **Consent Revocation** | User leaves group → Access is immediately denied |
| **Anonymous Fallback** | Unauthenticated users get anonymous identity → Mode A sites still accessible |
| **Multiple Groups** | User can join multiple groups for same site → Should see combined permissions |
| **Cross-Site Isolation** | User's consent for Site A should not affect Site B |

### Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Duplicate join attempts | Should be idempotent or return existing record |
| Join without matching inclusion spec | Should fail gracefully |
| Delete non-existent membership | Should return 204 (idempotent) |
| Expired session cookie | Should return anonymous identity, not error |

### Integration Points

| Integration | What to Test |
|-------------|--------------|
| Kratos | Session resolution, identity lookup, error handling |
| Warden | Authorization chain includes consent check |
| OAuth/Hydra | Client ID mapping to invitations |

## Related Documentation

- [Access Modes](access-modes.md) - The three orthogonal access conditions
- [Policies and Permissions](policies-and-permissions.md) - Group and policy configuration
- [OAuth Client Lifecycle](oauth-client-lifecycle.md) - Client ID management for consent flows
- [Warden Gateway](warden-gateway.md) - How Privy integrates with authorization
