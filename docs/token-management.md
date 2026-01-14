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

Nightscout's authorization system is based on Apache Shiro-style permissions with JWT tokens for stateless authentication.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Subject** | A named identity with a set of permissions (e.g., "readable", "careportal", "admin") |
| **Role** | A collection of permissions that can be assigned to subjects |
| **Token** | A time-limited JWT that encodes a subject's permissions for stateless auth |
| **API Secret** | The master credential that can manage subjects and roles |

### Permission Hierarchy

Nightscout uses shiro-style permission strings:

| Permission | Grants Access To |
|------------|------------------|
| `*` | Full administrative access (equivalent to API secret) |
| `api:*:read` | Read access to all API endpoints |
| `api:entries:read` | Read access to entries (glucose data) |
| `api:treatments:create` | Create treatments (careportal entries) |
| `api:treatments:*` | Full treatments access (read, create, update, delete) |

Common pre-configured subjects in Nightscout:

| Subject | Typical Permissions | Use Case |
|---------|---------------------|----------|
| `readable` | `api:*:read` | View-only access |
| `careportal` | `api:*:read`, `api:treatments:create` | Can log treatments |
| `admin` | `*` | Full access |

### Authorization API Endpoints

Nightscout exposes these endpoints for authorization management:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/authorization/subjects` | GET | List all configured subjects |
| `/api/v2/authorization/roles` | GET | List all available roles |
| `/api/v2/authorization/request/{subject}` | GET | Exchange subject for JWT token |

**Authentication**: These endpoints require the API secret (as `api-secret` header, SHA1 hashed) for management operations. Token requests may work with lesser credentials depending on Nightscout configuration.

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

3. Nightscout returns subject list
   └─▶ [
         { "name": "readable", "permissions": ["api:*:read"] },
         { "name": "careportal", "permissions": ["api:*:read", "api:treatments:create"] },
         { "name": "school-nurse", "permissions": ["api:*:read", "api:treatments:create"] }
       ]

4. Control Panel presents options to owner
   └─▶ "We found these existing subjects on your Nightscout:
        - readable (view only)
        - careportal (can log treatments)
        - school-nurse (custom role)
        Which would you like to map to your groups?"
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

> **Status**: NOT YET IMPLEMENTED. This section describes a proposed workflow for creating new Nightscout subjects with constrained permissions. This depends on Nightscout's authorization API capabilities, which need domain expert verification.

The Control Panel could create new subjects with constrained permissions, effectively "deprivileging" from the full API secret.

### Why Deprivilege?

| Scenario | Problem | Solution |
|----------|---------|----------|
| School nurse needs careportal access | API secret is too powerful | Create "school-nurse" subject with only careportal permissions |
| Babysitter needs view-only | No existing "readable" subject | Create constrained subject |
| Parent wants logging but no settings | careportal is too broad | Create custom subject with specific permissions |

### Proposed Deprivilege Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Subject Creation (Deprivilege) - PROPOSED                  │
└─────────────────────────────────────────────────────────────────────────────┘

1. Owner requests new subject via Control Panel
   └─▶ "Create a subject for my school nurse that can:
        ✓ View glucose data
        ✓ Log treatments
        ✗ Change settings
        ✗ Delete data"

2. Control Panel crafts subject definition
   └─▶ {
         "name": "school-nurse-lincoln-elem",
         "permissions": [
           "api:entries:read",
           "api:treatments:read",
           "api:treatments:create"
         ]
       }

3. Control Panel sends to Nightscout (via API secret)
   └─▶ POST /api/v2/authorization/subjects
       Header: api-secret: {sha1-hashed-secret}
       Body: { subject definition }

4. Subject is now available for NRG policies
   └─▶ Create policy with policy_type: "nsjwt", policy_spec: "school-nurse-lincoln-elem"
```

### Proposed Permission Templates

If subject creation is supported, the Control Panel could offer templates for common deprivilege scenarios:

| Template | Permissions | Use Case |
|----------|-------------|----------|
| **Monitor Only** | `api:entries:read`, `api:treatments:read` | View glucose and treatments, no changes |
| **Caregiver** | `api:*:read`, `api:treatments:create` | Full view, can log treatments |
| **Educator** | `api:entries:read` | Just glucose data for classroom monitoring |
| **Emergency** | `api:*:read`, `api:treatments:create`, `api:profile:read` | View profile for emergency info |

### Implementation Notes

**Open Questions for Domain Expert:**
- What is the exact API for creating subjects on Nightscout?
- Are subjects persisted or in-memory configuration?
- Can subjects be updated/deleted after creation?
- What happens if Nightscout restarts - are subjects preserved?

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

## Interview Questions / Domain Gaps

The following questions need input from a Nightscout domain expert to validate the proposed workflows and fill implementation gaps.

### Subject and Role Discovery (Critical for Authorization Discovery feature)

1. **Subject list endpoint**: What is the exact response format of `/api/v2/authorization/subjects`? What fields are returned?
2. **Role list endpoint**: What does `/api/v2/authorization/roles` return? How do roles relate to subjects?
3. **Authentication requirements**: Do these discovery endpoints require the full API secret, or can they work with lesser credentials?
4. **Default subjects**: What subjects exist by default on a fresh Nightscout installation?

### Subject Creation and Management (Critical for Deprivilege feature)

5. **Subject creation API**: Is there a POST endpoint to create new subjects? What's the exact request format?
6. **Subject persistence**: Are subjects stored in MongoDB or environment config (e.g., `AUTH_DEFAULT_ROLES`)? Do they survive Nightscout restarts?
7. **Subject updates**: Can existing subjects be modified or deleted via API?
8. **Heroku/Railway limitations**: Do managed hosting platforms restrict subject management?

### Token Request and Exchange (Validating current implementation)

9. **Token request authentication**: Does `/api/v2/authorization/request/{subject}` require the API secret header, or can any client request a token for a known subject?
10. **Token lifetime**: What determines the JWT expiration time? Is it configurable per-subject or globally?
11. **Token content**: What claims are included in the JWT beyond `iat`, `exp`, and permissions?
12. **Token validation**: How does Nightscout validate incoming JWTs? Is there a shared secret or key pair?

### Permission Model

13. **Permission strings**: What are all available permission strings beyond the common ones (`*`, `api:*:read`, `api:treatments:create`)?
14. **Permission inheritance**: Do some permissions imply others (e.g., does `api:treatments:*` include `:create`, `:read`, `:update`, `:delete`)?
15. **Custom permissions**: Can sites define custom permission strings, or are they limited to the built-in set?

### Backward Compatibility

16. **API versions**: Which Nightscout versions support the v2 authorization API? What's the minimum version?
17. **Fallback behavior**: How should NRG handle Nightscout instances that don't support v2 authorization?
18. **Legacy token format**: Are there older token formats we need to support?

### Edge Cases and Error Handling

19. **Invalid subject**: What HTTP status/response does Nightscout return when requesting a token for a non-existent subject?
20. **Rate limiting**: Does Nightscout rate-limit authorization API calls?
21. **Plugin permissions**: How do Nightscout plugins interact with the permission system?

### Security Considerations

22. **Secret rotation**: If a site owner rotates their API secret, what happens to existing subjects and cached tokens?
23. **Token revocation**: Is there a way to invalidate tokens before expiration?
24. **Audit trail**: Does Nightscout log which subjects/tokens accessed what data?
25. **Minimum permissions**: What's the absolute minimum permission set for basic glucose viewing (for the "monitor only" template)?

## Related Documentation

- [Policies and Permissions](./policies-and-permissions.md) - Full policy and schedule system
- [Access Modes](./access-modes.md) - How NSJWT fits into the three access modes
- [Warden Gateway](./warden-gateway.md) - Token exchange in the request flow
- [Criteria System](./criteria-system.md) - Planned authorization discovery criteria
