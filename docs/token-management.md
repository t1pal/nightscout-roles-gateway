# Token Management and Authorization Discovery

This document explains how NRG integrates with Nightscout's native authorization system to provide fine-grained, identity-aware access control. It covers the implemented NSJWT token exchange, plus proposed workflows for discovering existing authorizations and managing subjects.

## Current Implementation vs Planned Enhancements

| Capability | Status | Description |
|------------|--------|-------------|
| **NSJWT Token Exchange** | IMPLEMENTED | Exchange a configured subject for a Nightscout JWT at runtime |
| **Token Caching** | IMPLEMENTED | Cache exchanged tokens with 8-hour TTL |
| **X-NSJWT Header Injection** | IMPLEMENTED | Inject token into proxied requests |
| **Schedule-based Subject Switching** | IMPLEMENTED | Different `policy_spec` values at different times |
| **Authorization Discovery** | PROPOSED | Query Nightscout for existing subjects via API secret |
| **Subject Management (Deprivilege)** | PROPOSED | Create new constrained subjects via API secret |
| **NRG Subject Listing Endpoints** | PROPOSED | API endpoints to expose discovered subjects |

## Overview

NRG's token management enables a powerful workflow:

1. **Discovery** (PROPOSED): The Control Panel would use the site's API secret to discover what authorization subjects already exist on the Nightscout instance
2. **Mapping**: Site owners can map subjects to NRG groups and schedules (subjects must currently be known/configured manually)
3. **Deprivilege** (PROPOSED): The Control Panel could create new, constrained subjects for specific use cases
4. **Exchange** (IMPLEMENTED): At runtime, NRG exchanges the user's policy for a real Nightscout token and injects it into the request

This allows site owners to leverage Nightscout's native permission system (readable, careportal, admin, etc.) while NRG handles identity verification and time-based scheduling.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Token Management Flow                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Registration Time (PROPOSED - not yet implemented):
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐
│   Control   │────▶│     NRG     │────▶│  Upstream Nightscout    │
│    Panel    │     │             │     │                         │
└─────────────┘     └─────────────┘     └─────────────────────────┘
       │                                         │
       │  1. "Show me available subjects"        │
       │         (API secret)                    │
       │  ─────────────────────────────────────▶ │
       │                                         │
       │  2. Returns: readable, careportal,      │
       │     school-nurse, etc.                  │
       │  ◀───────────────────────────────────── │
       │                                         │
       │  3. Owner configures: "Map school-nurse │
       │     subject to School Staff group       │
       │     during 8am-3pm"                     │
       └─────────────────────────────────────────┘

Runtime (IMPLEMENTED):
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐
│   Visitor   │────▶│  NRG Warden │────▶│  Upstream Nightscout    │
│   (Nurse)   │     │             │     │                         │
└─────────────┘     └─────────────┘     └─────────────────────────┘
       │                  │                       │
       │  1. Request      │                       │
       │  ────────────▶   │                       │
       │                  │                       │
       │  2. Lookup ACL:  │                       │
       │     policy_type: nsjwt                   │
       │     policy_spec: "school-nurse"          │
       │                  │                       │
       │                  │  3. Exchange subject  │
       │                  │     for token         │
       │                  │  ─────────────────▶   │
       │                  │                       │
       │                  │  4. JWT with perms    │
       │                  │  ◀─────────────────   │
       │                  │                       │
       │  5. Proxy with   │                       │
       │     X-NSJWT      │                       │
       │  ◀────────────── │ ──────────────────▶   │
```

## Nightscout Authorization Protocol

Nightscout's authorization system is based on Apache Shiro-style permissions with JWT tokens for stateless authentication. This section documents the protocol based on the official Nightscout security audit (January 2026).

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Subject** | A named identity with a set of roles and an access token (e.g., "readable", "careportal", "admin") |
| **Role** | A collection of permissions that can be assigned to subjects |
| **Access Token** | A persistent identifier tied to a subject, used for authentication |
| **JWT** | A time-limited token (1 hour default) signed with HMAC-SHA256, containing the access token |
| **API Secret** | The master credential that can manage subjects and roles |

### Shiro Permission Format

Nightscout uses Apache Shiro-style permission strings in the format `domain:action:instance`:

| Permission | Grants Access To |
|------------|------------------|
| `*` | Full administrative access (equivalent to API secret) |
| `api:*:read` | Read access to all API endpoints |
| `api:*:*` | All API operations |
| `api:entries:read` | Read access to entries (glucose data) |
| `api:treatments:create` | Create treatments (careportal entries) |
| `api:treatments:*` | Full treatments access (read, create, update, delete) |
| `notifications:*:ack` | Acknowledge notifications |

### Default Roles (from Security Audit)

These roles are built into Nightscout:

| Role | Permissions | Description |
|------|-------------|-------------|
| `admin` | `*` | Full access |
| `readable` | `api:*:read`, `notifications:*:ack` | Read-only access |
| `denied` | (none) | No permissions |
| `careportal` | `api:treatments:create` | Can add treatments |
| `devicestatus-upload` | `api:devicestatus:create` | Loop/pump status upload |
| `activity-create` | `api:activity:create` | Activity logging |

### Access Token Generation

Access tokens are deterministic, derived from the API_SECRET and subject name:

```javascript
// From Nightscout security audit
function generateAccessToken(subjectName) {
  const hash = crypto.createHash('sha1');
  hash.update(apiSecret + subjectName);
  return subjectName.replace(' ', '-').toLowerCase() + '-' + hash.digest('hex').substring(0, 16);
}

// Example: "admin" subject → "admin-7a7f752c970fce6b"
```

**Security Note**: Tokens are deterministic - if API_SECRET is compromised, all tokens are predictable. Access tokens never expire until manually revoked. Stored in MongoDB `auth_subjects` collection.

### JWT Structure

```json
{
  "accessToken": "subject-access-token",
  "iat": 1234567890,
  "exp": 1234571490
}
```

- **Signing**: HMAC-SHA256 using API_SECRET
- **Default expiration**: 1 hour
- **No refresh tokens**: Must re-request when expired

### Authorization API Endpoints

Nightscout exposes these endpoints for authorization management:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/authorization/subjects` | GET | List all configured subjects with their access tokens and roles |
| `/api/v2/authorization/roles` | GET | List all available roles |
| `/api/v2/authorization/request/{subject}` | GET | Exchange subject name for JWT token |

### Subjects Endpoint Response Format

`GET /api/v2/authorization/subjects` returns an array of subject objects:

```json
[
  {
    "_id": "642ce46e89424207c56ab9a2",
    "name": "admin",
    "accessToken": "admin-7a7f752c970fce6b",
    "roles": ["admin"]
  },
  {
    "_id": "642ce4ac89424207c56ab9a3",
    "name": "readable",
    "accessToken": "readable-a1b2c3d4e5f6g7h8",
    "roles": ["readable"]
  },
  {
    "_id": "642ce4eb89424207c56ab9a4",
    "name": "school-nurse",
    "accessToken": "school-nurse-16e6e9eb6ead1e71",
    "roles": ["careportal", "readable"]
  }
]
```

**Fields**:
- `_id`: MongoDB document ID
- `name`: Human-readable subject name (used in policies)
- `accessToken`: The token to use for authentication or exchange for JWT
- `roles`: Array of role names assigned to this subject

**Authentication**: Requires API secret (as `api-secret` header, SHA1 hashed) for management operations.

## Authorization Discovery (PROPOSED)

> **Status**: NOT YET IMPLEMENTED. This section describes a proposed workflow that would enable the Control Panel to introspect Nightscout instances for existing authorization subjects. The Nightscout API endpoints described here exist, but NRG does not yet expose functionality to leverage them.

When a site owner registers their Nightscout with NRG, the Control Panel could introspect the instance to discover existing authorization subjects.

### Proposed Discovery Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Authorization Discovery                                 │
└─────────────────────────────────────────────────────────────────────────────┘

1. Owner registers site with API secret
   └─▶ NRG validates API secret via /api/v1/status.json (existing criteria)

2. Control Panel queries subjects
   └─▶ GET /api/v2/authorization/subjects
       Header: api-secret: {sha1-hashed-secret}

3. Nightscout returns subject list (actual format)
   └─▶ [
         { "_id": "...", "name": "admin", "accessToken": "admin-7a7f752c970fce6b", "roles": ["admin"] },
         { "_id": "...", "name": "readable", "accessToken": "readable-a1b2c3d4...", "roles": ["readable"] },
         { "_id": "...", "name": "school-nurse", "accessToken": "school-nurse-16e6...", "roles": ["careportal", "readable"] }
       ]

4. Control Panel presents options to owner
   └─▶ "We found these existing subjects on your Nightscout:
        - admin (full access)
        - readable (view only)  
        - school-nurse (can log treatments + view)
        Which would you like to map to your groups?"
        
5. Control Panel stores accessTokens for runtime use
   └─▶ No need to keep API secret for ongoing operation
```

### Proposed Control Panel Integration Points

To implement this workflow, the Control Panel would need to:

1. **Cache discovered subjects** - Store with site registration for quick access
2. **Present human-readable descriptions** - Translate permission strings to plain language
3. **Suggest mappings** - Recommend which subjects fit common use cases (school nurse → careportal during hours)
4. **Handle missing subjects** - Offer to create new subjects if needed (deprivilege flow)

### Planned NRG Endpoints

To support this workflow, NRG should expose:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/sites/{id}/subjects` | List discovered subjects for a registered site |
| `POST /api/v1/sites/{id}/subjects/refresh` | Re-fetch subjects from upstream Nightscout |

**Status**: NOT YET IMPLEMENTED - This is identified as future enhancement in the criteria system.

## Subject Management / Deprivilege (PROPOSED)

> **Status**: NOT YET IMPLEMENTED. This section describes a proposed workflow for creating new Nightscout subjects with constrained permissions and then using their access tokens instead of the API secret.

The Control Panel could create new subjects with constrained permissions, effectively "deprivileging" from the full API secret.

### Why Deprivilege?

The API secret grants full administrative access (`*` permission). By creating constrained subjects and using their access tokens, NRG can operate with least-privilege access:

| Scenario | Problem | Solution |
|----------|---------|----------|
| School nurse needs careportal access | API secret is too powerful | Create "school-nurse" subject with only careportal roles |
| Babysitter needs view-only | Sharing API secret is risky | Create constrained subject with readable role |
| NRG ongoing operation | Storing API secret is a security risk | Configure subjects once, then use access tokens |

### Proposed Deprivilege Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Deprivilege Workflow - PROPOSED                            │
└─────────────────────────────────────────────────────────────────────────────┘

SETUP PHASE (one-time, uses API secret):

1. Owner provides API secret during site registration
   └─▶ Control Panel uses it to query existing subjects

2. Control Panel discovers or creates needed subjects
   └─▶ GET /api/v2/authorization/subjects (list existing)
   └─▶ POST /api/v2/authorization/subjects (create new if needed)

3. Control Panel stores the access tokens
   └─▶ {
         "name": "school-nurse",
         "accessToken": "school-nurse-16e6e9eb6ead1e71",  ← Store this
         "roles": ["careportal", "readable"]
       }

4. API secret can now be dropped or rotated
   └─▶ NRG no longer needs the master secret for ongoing operation

───────────────────────────────────────────────────────────────────────────────

RUNTIME PHASE (uses access token, not API secret):

1. Visitor request arrives matching a policy
   └─▶ policy_type: "nsjwt", policy_spec: "school-nurse"

2. NRG uses stored access token to request JWT
   └─▶ GET /api/v2/authorization/request/school-nurse
       (or use access token directly depending on Nightscout config)

3. JWT injected into proxied request
   └─▶ X-NSJWT: {jwt-with-careportal-permissions}
```

### Security Benefits

| Aspect | With API Secret | With Access Tokens |
|--------|-----------------|-------------------|
| **Stored credential power** | Full admin (`*`) | Only assigned roles |
| **Compromise impact** | Total system access | Limited to subject's permissions |
| **Rotation** | Affects all subjects | Per-subject rotation possible |
| **Audit trail** | Actions logged as "admin" | Actions logged per subject |

### Proposed Permission Templates

The Control Panel could offer templates when creating new subjects:

| Template | Roles | Use Case |
|----------|-------|----------|
| **Monitor Only** | `readable` | View glucose and treatments, no changes |
| **Caregiver** | `readable`, `careportal` | Full view, can log treatments |
| **Uploader** | `devicestatus-upload` | Loop/pump status upload only |
| **Educator** | `readable` | Just glucose data for classroom monitoring |

### Subject Persistence

From the security audit:
- Subjects are stored in MongoDB `auth_subjects` collection
- They persist across Nightscout restarts
- Access tokens never expire until manually revoked

### Open Questions

- What is the exact API for creating/updating subjects on Nightscout?
- Can subjects be deleted via API, or only via direct database access?
- Is there a subject creation endpoint, or must subjects be configured via environment variables?

## NSJWT Exchange Flow (IMPLEMENTED)

> **Status**: IMPLEMENTED in `lib/exchanged.js`. This is the core token management capability that is working today.

When a policy has `policy_type: nsjwt`, NRG exchanges the configured subject for an actual Nightscout JWT at request time.

### Policy Configuration

```javascript
// Connection Policy with nsjwt type
{
  "site_id": "site_abc123",
  "group_definition_id": "group_nurses",
  "policy_name": "School Nurse Access",
  "policy_type": "nsjwt",           // Use Nightscout token exchange
  "policy_spec": "school-nurse"     // The subject to exchange for a token
}
```

### Exchange Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NSJWT Token Exchange                                │
└─────────────────────────────────────────────────────────────────────────────┘

     Visitor              NRG Warden           Token Cache        Upstream NS
        │                      │                    │                   │
        │  1. Request          │                    │                   │
        │  ───────────────────▶│                    │                   │
        │                      │                    │                   │
        │      2. Lookup ACL   │                    │                   │
        │      policy_type: nsjwt                   │                   │
        │      policy_spec: "school-nurse"          │                   │
        │                      │                    │                   │
        │                      │  3. Check cache    │                   │
        │                      │  key: "school-nurse.{subject}"         │
        │                      │  ─────────────────▶│                   │
        │                      │                    │                   │
        │                      │  4a. Cache HIT     │                   │
        │                      │  ◀─────────────────│                   │
        │                      │  (return cached token)                 │
        │                      │                    │                   │
        │              ─ OR ─  │                    │                   │
        │                      │                    │                   │
        │                      │  4b. Cache MISS    │                   │
        │                      │  ◀─────────────────│                   │
        │                      │                    │                   │
        │                      │  5. Request token  │                   │
        │                      │  GET /api/v2/authorization/request/{subject}
        │                      │  ─────────────────────────────────────▶│
        │                      │                    │                   │
        │                      │  6. JWT response   │                   │
        │                      │  { token, iat, exp }                   │
        │                      │  ◀─────────────────────────────────────│
        │                      │                    │                   │
        │                      │  7. Store in cache │                   │
        │                      │  TTL = exp - iat   │                   │
        │                      │  ─────────────────▶│                   │
        │                      │                    │                   │
        │  8. Proxy request    │                    │                   │
        │  with X-NSJWT header │                    │                   │
        │  ◀───────────────────│───────────────────────────────────────▶│
        │                      │                    │                   │
```

### Implementation Details

From `lib/exchanged.js`:

```javascript
// Cache configuration
var keyv_opts = {
  ttl: 28800 * 1000,  // 8 hours default TTL
  namespace: 'gateway-nightscout-token-cache'
};

// Cache key format
var key = [acl.policy_spec, acl.subject].join('.');
// Example: "school-nurse.user_abc123"

// Token exchange endpoint
http.get('/api/v2/authorization/request/' + acl.policy_spec)
```

### Response Headers

When the exchange succeeds, NRG sets:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-NSJWT` | The exchanged JWT token | Nightscout uses this for permission enforcement |

The upstream Nightscout instance validates this JWT and enforces the embedded shiro permissions.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Cache hit | Token returned immediately, no upstream call |
| Cache miss | Fetch from Nightscout, cache for TTL |
| Nightscout unreachable | Error propagates, request fails |
| Invalid subject | Nightscout returns error, request fails |
| Expired token | Cache TTL prevents this; token fetched fresh |

## Combining NSJWT with Schedules (IMPLEMENTED)

> **Status**: IMPLEMENTED. Schedule-based policy switching works with NSJWT policies, allowing different subjects at different times.

The most powerful feature is combining NSJWT policies with time-based schedules. This allows the same user to have different permission levels at different times.

### Use Case: School Nurse

**Goal**: During school hours (8am-3pm M-F), the nurse can log treatments. Outside hours, view-only access.

**Configuration**:

```
Group: "School Health Staff"
  └─ Inclusion Spec: nurse@lincoln-elementary.edu

Connection Policy: "School Nurse - Treatment Hours"
  └─ site_id: {the site}
  └─ group_definition_id: {School Health Staff}
  └─ policy_type: nsjwt
  └─ policy_spec: careportal    ← Base permission (used during school hours)

Scheduled Policy: "School Hours Override"
  └─ policy_id: {School Nurse - Treatment Hours}
  └─ schedule_segments: "0,115200,140400,201600,226800,288000,313200,374400,399600,460800,486000"
  └─ fill_pattern: "readable,careportal,readable,careportal,readable,careportal,readable,careportal,readable,careportal,readable"
```

### How It Works at Runtime

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               Schedule + NSJWT Evaluation                                    │
└─────────────────────────────────────────────────────────────────────────────┘

1. Nurse visits site at 10:00 AM Tuesday
   └─▶ Warden receives request with nurse's identity

2. ACL lookup finds active schedule segment
   └─▶ unified_active_site_policies returns:
       {
         policy_type: "nsjwt",
         policy_spec: "careportal"    ← Schedule overrode to "careportal"
       }

3. NSJWT exchange for "careportal" subject
   └─▶ Token with api:treatments:create permission

4. Nurse can log treatments ✓

─────────────────────────────────────────────────────────────────────────────

1. Same nurse visits at 5:00 PM Tuesday
   └─▶ Warden receives request with nurse's identity

2. ACL lookup finds active schedule segment
   └─▶ unified_active_site_policies returns:
       {
         policy_type: "nsjwt",
         policy_spec: "readable"      ← Schedule overrode to "readable"
       }

3. NSJWT exchange for "readable" subject
   └─▶ Token with only api:*:read permission

4. Nurse can view but NOT log treatments ✗
```

### Multiple Schedule Patterns

| Pattern | Schedule Config | Result |
|---------|-----------------|--------|
| **Weekday Caregiver** | M-F 7am-9pm: careportal | Treatment access during waking hours |
| **Weekend Babysitter** | Sat-Sun all day: careportal | Treatment access only on weekends |
| **Emergency Only** | All times: readable, Specific event: careportal | Normally view-only, elevated during event |
| **Rotating Caregivers** | Different subjects per day | Each caregiver's permissions on their shift |

## Database Storage

Token-related data is stored across these tables:

| Table | Purpose |
|-------|---------|
| `nightscout_secrets` | Hashed API secrets for registered sites |
| `connection_policies` | Policy definitions including `policy_type` and `policy_spec` |
| `scheduled_policies` | Time-based overrides including alternate `policy_spec` values |

**Note**: Discovered subjects are not currently persisted in NRG. This is an area for enhancement.

## Code Locations

| Component | File |
|-----------|------|
| Token exchange logic | `lib/exchanged.js` |
| NSJWT header injection | `lib/exchanged.js` → `set_acl_token_header` |
| Token cache | Keyv instance in `lib/exchanged.js` |
| Policy evaluation | `lib/policies/index.js` |
| ACL resolution | SQL views in migrations |

## Interview Questions / Remaining Gaps

Many questions have been answered by the Nightscout security audit and API inspection. The following questions remain open for domain expert input.

### Answered Questions (from Security Audit)

| Question | Answer |
|----------|--------|
| Subject list response format | Array with `_id`, `name`, `accessToken`, `roles` fields |
| JWT lifetime | 1 hour default |
| JWT signing | HMAC-SHA256 with API_SECRET |
| Subject persistence | MongoDB `auth_subjects` collection, survives restarts |
| Access token format | `{name}-{sha1(apiSecret+name).substring(0,16)}` |
| Default roles | admin, readable, denied, careportal, devicestatus-upload, activity-create |
| Permission format | Shiro-style `domain:action:instance` |
| Brute-force protection | IP delay list with cumulative delays |

### Remaining Questions for Domain Expert

#### Subject Management API

1. **Subject creation**: Is there a POST endpoint to create new subjects via API? What's the request format?
2. **Subject modification**: Can existing subjects be updated or deleted via API?
3. **AUTH_DEFAULT_ROLES**: How does this environment variable interact with API-created subjects?

#### Token Exchange Details

4. **Token request auth**: Does `/api/v2/authorization/request/{subject}` require API secret, or can it work with just the access token?
5. **Access token vs subject name**: Can we request a JWT using the access token directly, or must we use the subject name?

#### Platform Variations

6. **Heroku/Railway**: Do managed hosting platforms restrict subject management or authorization APIs?
7. **Minimum version**: What's the minimum Nightscout version that supports the v2 authorization API?
8. **Fallback**: How should NRG handle instances that don't support v2 authorization?

#### Security Edge Cases

9. **Secret rotation impact**: If API_SECRET is rotated, are existing access tokens invalidated (since they're derived from the secret)?
10. **Token revocation**: Is there a way to invalidate access tokens or JWTs before their natural expiration?
11. **Error responses**: What HTTP status/response does Nightscout return for invalid subject or unauthorized requests?

### Questions No Longer Needed

The following were answered and incorporated into the documentation:
- JWT structure and claims
- Default roles and permissions
- Token derivation formula
- Subject storage location
- Permission string format

## Related Documentation

- [Policies and Permissions](./policies-and-permissions.md) - Full policy and schedule system
- [Access Modes](./access-modes.md) - How NSJWT fits into the three access modes
- [Warden Gateway](./warden-gateway.md) - Token exchange in the request flow
- [Criteria System](./criteria-system.md) - Planned authorization discovery criteria
