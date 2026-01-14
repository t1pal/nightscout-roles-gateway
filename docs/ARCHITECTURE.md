# Nightscout Roles Gateway - Architecture & Theory of Operations

## Executive Summary

The Nightscout Roles Gateway (NRG) is a cloud-native RBAC (Role-Based Access Control) controller that sits between users and Nightscout CGM (Continuous Glucose Monitoring) instances. It provides scheduled, identity-aware access control that Nightscout itself cannot natively provide.

**The fundamental problem NRG solves**: Nightscout was designed as a personal tool with simple authentication (API secret). When families, caregivers, schools, and healthcare providers need access, Nightscout's binary "all or nothing" model breaks down. NRG adds a sophisticated permission layer without modifying Nightscout itself.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NRG Gateway                                     │
│                                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────────────────┐ │
│  │   Vanity    │    │   Warden     │    │      Policy Resolution          │ │
│  │    URL      │───▶│   Routes     │───▶│  ┌─────────────────────────┐    │ │
│  │ site.gw.com │    │              │    │  │ Mode C: API Secret?    │    │ │
│  └─────────────┘    │  decision()  │    │  │ Mode A: Anonymous OK?  │    │ │
│                     │              │    │  │ Mode B: Identity ACL?  │    │ │
│                     └──────────────┘    │  │ Schedule Active?       │    │ │
│                            │            │  └─────────────────────────┘    │ │
│                            ▼            └─────────────────────────────────┘ │
│                     ┌──────────────┐                                        │
│                     │   Upstream   │                                        │
│                     │   Proxy      │                                        │
│                     └──────────────┘                                        │
│                            │                                                │
└────────────────────────────┼────────────────────────────────────────────────┘
                             ▼
                     ┌──────────────┐
                     │  Nightscout  │
                     │   Instance   │
                     └──────────────┘
```

## Core Concepts

### 1. Sites: The Protected Resources

A **registered site** is a Nightscout instance that an owner has brought under NRG management. Each site has:

- **expected_name**: A vanity subdomain (e.g., `johnny` → `johnny.gateway.example.com`)
- **upstream_origin**: The actual Nightscout URL being proxied
- **owner_ref**: Identity of the person who controls this site's policies
- **require_identities**: Whether visitors must log in (Mode B toggle)
- **exempt_matching_api_secret**: Whether API secret bypass is enabled (Mode C toggle)

**Why this exists**: Nightscout instances can be anywhere—Heroku, MongoDB Atlas, self-hosted. NRG provides a stable, controlled entry point with a consistent URL regardless of where the actual Nightscout lives.

### 2. Groups: Collections of Identities (Roles)

A **group** represents a collection of people who should have the same access rights. Groups are defined by **inclusion specs** that match identities.

| Component | Purpose |
|-----------|---------|
| `group_definitions` | The group itself (name, owner, whether it's a deny group) |
| `group_inclusion_specs` | Rules for who belongs (email addresses, identity types) |

**Example**: A "School Health Staff" group might include:
- `nurse@lincoln-elementary.edu` (identity_type: email)
- `health.aide@lincoln-elementary.edu` (identity_type: email)

**Why this exists**: Rather than managing individual users per-site, groups allow policy reuse. The same "Family" group can be assigned to multiple sites with different schedules.

### 3. Connection Policies: Linking Groups to Sites

A **connection policy** binds a group to a site with a permission type:

| Field | Purpose |
|-------|---------|
| `site_id` | Which site this policy applies to |
| `group_definition_id` | Which group gets this permission |
| `policy_type` | Type of policy (e.g., `default`, `nsjwt`, or custom) |
| `policy_spec` | Permission specification (commonly `allow` or `deny`, but can hold other values like JWT payloads) |
| `sort` | Evaluation order |

**Policy types and specs**:
- `policy_type = 'default'` with `policy_spec = 'allow'` or `'deny'` - Standard access control
- `policy_type = 'nsjwt'` - Intended for Nightscout JWT token exchange (partially implemented, see ROADMAP.md)
- Custom values are schema-permitted for extensibility

**Why this exists**: The same group might have different permissions on different sites. A school nurse might have view-only access to one child's data but careportal access to another (via different policy types).

### 4. Scheduled Policies: Time-Based Access

A **scheduled policy** modifies a connection policy based on time:

| Field | Purpose |
|-------|---------|
| `policy_id` | The connection policy being scheduled |
| `schedule_segments` | Comma-separated offsets in seconds since Sunday midnight |
| `fill_pattern` | Comma-separated permissions for each segment |
| `schedule_type` | Currently always `week` |

**Why this exists**: Real-world access needs are time-bound. School nurses only need access during school hours. Babysitters only need access during their shift. Without scheduling, owners would need to manually toggle permissions.

### 5. Joined Groups: Consent Tracking

The **joined_groups** table records when a user has accepted an invitation and consented to access:

| Field | Purpose |
|-------|---------|
| `subject` | The user's identity (from Kratos) |
| `expected_name` | The site they consented to access |
| `group_id` | The group they joined |
| `policy_id` | The policy granting access |

**Why this exists**: Privacy and audit requirements. When a school nurse accesses a child's glucose data, there should be a record that they consented to being identified as the accessor.

## The Three Access Modes

NRG supports three orthogonal access conditions that can be combined:

### Mode A: Anonymous/Public

The site is accessible to anyone with the link. This mirrors traditional Nightscout behavior.

```
require_identities = false → Anyone can view
```

### Mode B: Identity-Mapped

Visitors must log in, and their access is controlled by group membership and policies.

```
require_identities = true → Must match ACL
  └─ Check unified_active_site_policies view
     └─ policy_spec = 'allow' → Grant access
     └─ No match → 403 Forbidden
```

### Mode C: Legacy Escape Hatch

Requests with a valid API-SECRET header bypass identity requirements. This keeps uploaders and legacy apps working.

```
API-SECRET header present?
  └─ Hash matches nightscout_secrets table?
     └─ exempt_matching_api_secret = true → Grant access
```

## Database Architecture

### Core Tables

```
┌─────────────────────────┐
│    registered_sites     │ ◀─── The protected resources
├─────────────────────────┤
│ id, owner_ref           │
│ expected_name           │
│ upstream_origin         │
│ require_identities      │
│ exempt_matching_api_secret │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│   connection_policies   │◀──────▶│    group_definitions    │
├─────────────────────────┤        ├─────────────────────────┤
│ site_id                 │        │ id, owner_ref           │
│ group_definition_id     │        │ nickname                │
│ policy_type, policy_spec│        │ deny_access             │
│ sort                    │        └────────────┬────────────┘
└────────────┬────────────┘                     │
             │                                  ▼
             ▼                    ┌─────────────────────────┐
┌─────────────────────────┐      │  group_inclusion_specs  │
│   scheduled_policies    │      ├─────────────────────────┤
├─────────────────────────┤      │ group_definition_id     │
│ policy_id               │      │ identity_type           │
│ fill_pattern            │      │ identity_spec           │
│ schedule_segments       │      └─────────────────────────┘
└─────────────────────────┘
```

### View Hierarchy

The system uses a hierarchy of views to compose ACL decisions:

```
site_acls                          ◀─ Joins sites, policies, groups, specs
    │
    ▼
site_policy_overview               ◀─ Flattened policy assignments
    │
    ▼
site_policy_schedules              ◀─ Expands schedule segments with fill patterns
    │
    ▼
site_policy_schedules_active       ◀─ Filters to currently active segments
    │
    ▼
unified_active_site_policies       ◀─ Final decision view (uses COALESCE for schedule override)
```

### Security Tables

| Table | Purpose |
|-------|---------|
| `nightscout_secrets` | Hashed API secrets for Mode C verification |
| `nightscout_inspection_results` | BYOD validation audit results |
| `nightscout_inspection_details` | Individual criteria outcomes |
| `nightscout_authenticity_records` | Certificates of validated Nightscout instances |
| `reserved_expected_names` | Blocked vanity names |
| `reserved_upstream_origin` | Blocked upstream URLs |

### Activity Tables

| Table | Purpose |
|-------|---------|
| `permission_assignment_activities` | Audit log of policy changes |
| `joined_groups` | Consent records for identity-mapped access |

## The Decision Flow

When a request arrives at a vanity URL, the `decision()` function in `lib/policies/index.js` evaluates access:

```
1. Is site enabled?
   └─ No → 403 Forbidden

2. Strictly Nightscout mode enabled? (env.upstream.strictly_nightscout)
   └─ Yes → Check nightscout_authenticity_records.acceptable
      └─ Not acceptable → 403 Forbidden

3. Does request have matching API secret? (Mode C)
   └─ Check API-SECRET header against nightscout_secrets.hashed_api_secret
   └─ Match found AND exempt_matching_api_secret=true?
      └─ Yes → Allow (skip remaining checks)

4. Does site require identities? (Mode B toggle)
   └─ No → Allow anonymous (Mode A)
   └─ Yes → Continue to ACL check

5. Look up user's ACL via x-policy-id header
   └─ ACL found with policy_spec='allow'?
      └─ Yes → Allow
   └─ ACL found with policy_type='nsjwt' AND nsjwt.token present?
      └─ Yes → Allow (Note: nsjwt exchange partially implemented)
   └─ No valid ACL → 403 Forbidden
```

**Required Headers for Warden Endpoint**:
- `API-SECRET`: For Mode C bypass (hashed value compared)
- `x-policy-id`: Identifies the policy/ACL to check
- `x-group-id`, `x-email-spec`: Additional identity filters
- The warden sets response headers `x-upstream-origin` and `x-forwarded-host` on success

## Trigger System

The database uses PostgreSQL triggers extensively to maintain consistency:

### Secret Hashing
When `api_secret` is set on `registered_sites`, triggers automatically:
1. Hash the secret with SHA-1
2. Store in `nightscout_secrets`
3. Clear the plaintext from `registered_sites`

### Cascade Cleanup
When a site is deleted:
1. `delete_site_resources()` removes groups, policies, inspection records
2. `remove_joined_groups_via_policy()` cleans up consent records

### Validation
When `upstream_origin` changes:
1. `check_site_reserved_upstream()` blocks reserved upstreams
2. `invalidate_previous_result_certificates()` clears stale authenticity records

### Sort Order
`initialize_connection_policy_sort()` auto-assigns sort order to new policies.

## BYOD Criteria System

The criteria system prevents abuse of NRG as an open proxy by validating Nightscout instances:

### Inspection Pipeline

```
Stage 1: Static Analysis (no network)
├─ API secret minimum length (12 chars)
└─ URL syntax validation

Stage 2: API Liveness
└─ GET /api/v1/status.json returns 200

Stage 3: Authenticated Check
└─ GET /api/v1/status.json with hashed API-SECRET returns 200
```

Only instances passing all mandatory criteria can be registered.

## Data Flow Examples

### Example 1: School Nurse Access (Mode B + Schedule)

```
1. Owner creates group "School Health Office"
2. Owner adds inclusion spec: email=nurse@school.edu
3. Owner creates connection policy linking group to site
4. Owner adds schedule: Monday-Friday 8am-3pm = allow, else deny
5. Nurse receives invitation email
6. Nurse logs in via Kratos OAuth
7. Nurse consents → joined_groups record created
8. Nurse visits site at 10am → Schedule evaluates to 'allow' → Access granted
9. Nurse visits site at 6pm → Schedule evaluates to 'deny' → 403
```

### Example 2: Uploader Device (Mode C)

```
1. xDrip+ sends glucose data with API-SECRET header
2. NRG hashes the secret
3. Hash matches nightscout_secrets entry
4. Site has exempt_matching_api_secret=true
5. Request proxied to upstream without identity check
```

### Example 3: Public Sharing (Mode A)

```
1. Owner sets require_identities=false
2. Anyone with URL can view
3. API secret still required for write operations (enforced by Nightscout itself)
```

## Integration Points

### Kratos/Hydra (Identity)

NRG delegates authentication to ORY Kratos for user management and Hydra for OAuth flows. The `subject` field in `joined_groups` maps to Kratos user IDs.

### Nightscout Authorization

When `policy_type=nsjwt`, NRG exchanges authorization with Nightscout's `/api/v2/authorization/` endpoints to obtain JWTs with shiro permissions. This enables fine-grained access (careportal, treatments) within Nightscout's native permission model.

### Load Balancer (NGINX)

NRG's warden endpoints are designed to be called by NGINX's `auth_request` directive. The response headers include `x-upstream-origin` to direct the proxy.

## Why This Design?

### Separation of Concerns

- **Nightscout** handles glucose data and CGM integration
- **NRG** handles identity, authorization, and scheduling
- **Load balancer** handles proxying and TLS

### Minimal Nightscout Modification

NRG works with unmodified Nightscout instances. Owners don't need to run special builds or configure complex plugins.

### Audit Trail

The `joined_groups` and `permission_assignment_activities` tables provide accountability for HIPAA-adjacent use cases.

### Flexibility Over Simplicity

The group/policy/schedule model is more complex than simple user lists, but it supports real-world scenarios like:
- Different caregivers on different days
- School staff access during school hours only
- Time-limited babysitter access
- Healthcare provider access with consent logging

## Related Documentation

- [Access Modes](./access-modes.md) - Detailed Mode A/B/C documentation
- [Policies and Permissions](./policies-and-permissions.md) - Schedule math and ACL resolution
- [Criteria System](./criteria-system.md) - BYOD validation pipeline
- [Migration Narrative](./MIGRATIONS-NARRATIVE.md) - How the schema evolved
