# Warden Gateway

The Warden Gateway is NRG's NGINX-facing authorization layer. It provides endpoints that NGINX calls via `auth_request` directives to determine whether to allow a request and where to proxy it.

## Purpose

When a user visits a vanity URL (e.g., `yoursite.example.com`), NGINX doesn't know:
1. Whether the request should be allowed
2. What upstream Nightscout instance to proxy to

The Warden Gateway answers both questions by:
- Evaluating the user's identity against configured policies
- Returning the upstream URL via response headers
- Enforcing the three access modes (anonymous, identity-mapped, legacy escape hatch)

## Architecture Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Incoming Request                             │
│                    (yoursite.example.com/...)                        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        NGINX Load Balancer                           │
│                                                                      │
│   location / {                                                       │
│     auth_request /warden;                                            │
│     auth_request_set $upstream $upstream_http_x_upstream_origin;     │
│     proxy_pass $upstream;                                            │
│   }                                                                  │
│                                                                      │
│   location = /warden {                                               │
│     internal;                                                        │
│     proxy_pass http://nrg:5000/warden/v1/active/backend/for/$host;   │
│   }                                                                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Nightscout Roles Gateway (NRG)                    │
│                                                                      │
│   GET /warden/v1/active/backend/for/:expected_name                   │
│                                                                      │
│   Returns:                                                           │
│     - 200 + x-upstream-origin header → Allow and proxy               │
│     - 403 → Deny access                                              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼ (if allowed)
┌─────────────────────────────────────────────────────────────────────┐
│                   Registered Nightscout Instance                     │
│                   (https://actual-ns.herokuapp.com)                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Active Endpoints

### Primary: Active Backend Lookup

```
GET  /warden/v1/active/backend/for/:expected_name
HEAD /warden/v1/active/backend/for/:expected_name
```

**Purpose**: NGINX calls this endpoint to authorize a request and learn the upstream URL.

**Parameters**:
- `expected_name` (path) - The vanity name (hostname prefix) of the site

**Headers Read**:
- `Cookie` - Used to identify the logged-in user via Kratos session
- `API-SECRET` - Hashed Nightscout API secret for legacy device authentication

**Response**:
- `200 OK` - Access granted
- `403 Forbidden` - Access denied

**Response Headers** (on success):
- `x-upstream-origin` - The full upstream URL to proxy to
- `x-forwarded-host` - The upstream hostname for the `Host` header
- `X-NSJWT` - (Optional) Nightscout JWT for authorized subject access

### Portal Variant

```
GET /warden/v1/portal/:subject/backend/for/:expected_name
```

**Purpose**: Used by the WWW Viewer frontend to check access for a specific subject.

**Parameters**:
- `subject` - The Kratos identity ID of the user
- `expected_name` - The vanity name of the site

This variant bypasses session cookie lookup and directly uses the provided subject ID.

## Handler Chain

The request flows through a series of middleware handlers:

```
Request
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 1. find_expected_name                                             │
│    Looks up the site by expected_name in registered_sites table   │
│    Joins with nightscout_authenticity_records for BYOD status     │
│    Sets: req.site                                                 │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. kratos_whoami                                                  │
│    Calls Ory Kratos to identify the user from session cookie      │
│    On 401 (no session), falls back to anonymous identity:         │
│      { id: 'anonymous', traits: { email: '' } }                   │
│    Sets: req.user, res.locals.session, res.locals.identity        │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. get_acl_by_identity_param                                      │
│    Finds ACL entry matching user's identity and site              │
│    Queries unified_active_site_policies + joined_groups           │
│    Sets: res.locals.acl                                           │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. exchange_acl_token                                             │
│    If ACL policy_type is 'nsjwt', fetches Nightscout JWT          │
│    Caches tokens with TTL based on expiration                     │
│    Sets: res.locals.nsjwt                                         │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. policy()                                                       │
│    Initializes policy context with site configuration             │
│    Sets: res.locals.policy                                        │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. deny_site_prefs                                                │
│    Quick rejection if site is disabled (is_enabled = false)       │
│    Returns 403 if site is not active                              │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. matches_api_secret                                             │
│    Checks if API-SECRET header matches site's stored secret       │
│    Sets: res.locals.policy.allow_for_matching_api_secret          │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 8. decision                                                       │
│    Core authorization logic - evaluates all access modes          │
│    Sets: res.locals.active (boolean)                              │
│    Sets status 403 if denied                                      │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 9. set_acl_token_header                                           │
│    If authorized via NSJWT, adds X-NSJWT header to response       │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 10. specify_upstream_handler                                      │
│     Only if active=true: sets x-upstream-origin, x-forwarded-host │
│     Headers are NOT set on 403 responses                          │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 11. locals_results                                                │
│     Injects full_domain into payload via jsonpath                 │
│     Sends res.locals as JSON response body (res.json)             │
│     Calls next() allowing Restify audit hooks to execute          │
│     (Last handler in route definition)                            │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
JSON response sent to client
```

## Decision Logic

The `decision` handler evaluates access based on site configuration and user context:

```javascript
// Pseudocode for decision logic
active = site.is_enabled

// BYOD sites must pass authenticity check
if (strictly_nightscout) {
  active = site.acceptable && active
}

if (!active) {
  return 403
}

// Access Mode Evaluation
if (allow_for_matching_api_secret) {
  // Legacy Escape Hatch: API secret matches and site allows it
  active = true
} 
else if (site.require_identities) {
  // Identity-Mapped: Check if user has ACL with policy_spec='allow'
  active = (acl && acl.policy_spec == 'allow')
}
// else: Anonymous access - already active from is_enabled

// NSJWT override: If policy provides a valid token, allow
if (acl.policy_type == 'nsjwt' && nsjwt.token) {
  active = true
}

if (!active) {
  return 403
}
```

### Access Mode Summary

| Mode | Condition | Site Configuration |
|------|-----------|-------------------|
| **Anonymous** | Site enabled, no identity required | `require_identities = false` |
| **Identity-Mapped** | User has matching ACL entry | `require_identities = true` + policy with `policy_spec = 'allow'` |
| **Legacy Escape Hatch** | API-SECRET header matches | `exempt_matching_api_secret = true` |
| **NSJWT Token** | ACL provides Nightscout JWT | `policy_type = 'nsjwt'` |

### BYOD Authenticity Gate

When `strictly_nightscout` is enabled (production mode), BYOD sites must pass authenticity validation before any access mode is evaluated:

```javascript
if (strictly_nightscout) {
  active = site.acceptable && active
}
```

This means a BYOD site with `acceptable = false` will be denied even if:
- The site is enabled (`is_enabled = true`)
- The user has a valid ACL
- A matching API secret is provided

The `acceptable` flag comes from the criteria audit system (see `criteria-system.md`).

## Response Format

The Warden returns both headers and a JSON body. NGINX primarily uses the headers for routing decisions, while the JSON body provides observability and debugging information.

### JSON Response Body

The `locals_results` handler serializes `res.locals` to JSON:

```json
{
  "policy": {
    "site": { /* site record */ },
    "has_schedules": false,
    "require_identities": true,
    "has_matching_api_secret": false,
    "allow_for_matching_api_secret": false
  },
  "acl": { /* matched ACL or null */ },
  "active": true,
  "nsjwt": { /* token data if applicable */ },
  "session": { /* Kratos session data */ },
  "identity": { /* user identity */ },
  "full_domain": "yoursite.example.com"
}
```

The `full_domain` field is injected via jsonpath for logging and observability.

This payload helps with:
- Debugging authorization decisions
- Logging and audit trails
- Frontend display of access status

### Response Headers

Headers returned to NGINX when access is granted:

| Header | Purpose | Example |
|--------|---------|---------|
| `x-upstream-origin` | Full URL of the Nightscout instance | `https://myns.herokuapp.com` |
| `x-forwarded-host` | Hostname for upstream Host header | `myns.herokuapp.com` |
| `X-NSJWT` | Nightscout JWT for authorized access | `eyJhbGciOiJIUzI1NiIs...` |

NGINX uses these to:
1. Set `$upstream` variable from `x-upstream-origin`
2. Proxy the request with `proxy_pass $upstream`
3. Optionally forward the JWT for Nightscout authorization

## NSJWT Token Exchange

When a user accesses a site via identity-mapped policy with `policy_type = 'nsjwt'`, the gateway exchanges their ACL for a Nightscout JWT:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Token Exchange Flow                           │
└─────────────────────────────────────────────────────────────────────┘

1. User request arrives with valid ACL (policy_type = 'nsjwt')
   └─ ACL contains: policy_spec (the Nightscout subject/role)

2. Gateway checks cache for existing token
   └─ Cache key: "{policy_spec}.{subject}"
   └─ Cache namespace: "gateway-nightscout-token-cache"
   └─ Default TTL: 8 hours

3. If not cached, request new token from upstream Nightscout:
   └─ GET {upstream_origin}/api/v2/authorization/request/{policy_spec}
   └─ Returns JWT with exp/iat claims

4. Cache the token with TTL from (exp - iat)

5. Return token in X-NSJWT header
```

This mechanism allows:
- **Deprivileged access**: Users get tokens scoped to their specific role, not the full API secret
- **Efficient caching**: Tokens are reused until expiration
- **Transparent authorization**: Nightscout sees a valid JWT, not the gateway

### Cache Configuration

The token cache uses Keyv with configurable backend:

```javascript
{
  uri: opts.cache.uri,        // Redis URL or undefined for in-memory
  ttl: 28800 * 1000,          // 8 hours default
  namespace: 'gateway-nightscout-token-cache'
}
```

## Placeholder Endpoints

The following endpoints are defined but return `noOp` (no operation). They represent planned functionality for the WWW Viewer frontend:

```
GET /warden/v1/active/session/for/:expected_name
GET /warden/v1/allowed/identity/for/:expected_name
GET /warden/v1/allowed/permission/for/:expected_name
GET /warden/v1/rbac/for/:expected_name
GET /warden/v1/authenticate/me/for/:expected_name
GET /warden/v1/information/groups/for/me
GET /warden/v1/my/groups
GET /warden/v1/my/groups/:id
GET /warden/v1/my/groups/:id/info
GET /warden/v1/my/groups/:id/specs
GET /warden/v1/my/groups/:id/specs/:spec_id
GET /warden/v1/my/sites
GET /warden/v1/my/sites/:id
GET /warden/v1/my/permissions
```

These are intended for user-facing features like "show me my accessible sites" or "list my group memberships."

## Database Views Used

The Warden relies on these database views for efficient policy lookup:

- **`unified_active_site_policies`** - Denormalized view combining sites, groups, and active policies
- **`site_policy_overview`** - Overview of all site policies and their status

## Related Documentation

- `access-modes.md` - Detailed explanation of the three access modes
- `policies-and-permissions.md` - How groups and policies are configured
- `criteria-system.md` - BYOD validation that sets `acceptable` status
- `oauth-client-lifecycle.md` - How invitation/RSVP creates joined_groups entries
