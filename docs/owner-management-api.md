# Owner Management API

This document describes the owner-centric API endpoints used by the T1Pal control panel to manage Nightscout sites, groups, and policies on behalf of site owners.

## Overview

The Owner Management API provides aggregated views and CRUD operations scoped to a specific `owner_ref`. These endpoints are designed for the control panel interface where a Nightscout owner configures their sites' access policies.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **owner_ref** | A unique identifier for the Nightscout site owner (from the control panel's identity system) |
| **expected_name** | The vanity URL prefix for a registered site (e.g., `johndoe` for `johndoe.example.com`) |
| **group_id** | Unique identifier for a group definition |

### API Base Path

All owner management endpoints are under:
```
/api/v1/owner/:owner_ref/
```

## Architecture

The Owner API uses database views to provide denormalized, aggregated data for efficient control panel rendering:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            T1Pal Control Panel                               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ REST API
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Owner Management API                             │
│  /api/v1/owner/:owner_ref/...                                               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
            │  site_acls   │ │owner_group_  │ │ site_policy_overview │
            │    (view)    │ │ usage (view) │ │       (view)         │
            └──────────────┘ └──────────────┘ └──────────────────────┘
                    │                │                │
                    └────────────────┼────────────────┘
                                     ▼
            ┌─────────────────────────────────────────────────────────┐
            │                    Base Tables                          │
            │  registered_sites, group_definitions, connection_policies│
            │  group_inclusion_specs, scheduled_policies               │
            └─────────────────────────────────────────────────────────┘
```

## Database Views

### site_acls

A denormalized view joining sites, groups, inclusion specs, connection policies, and schedules. Used to display the complete ACL configuration for an owner's sites.

**Columns:**

| Column | Source | Description |
|--------|--------|-------------|
| `id` | registered_sites | Site ID |
| `owner_ref` | registered_sites | Owner identifier |
| `expected_name` | registered_sites | Vanity URL prefix |
| `upstream_origin` | registered_sites | Backend Nightscout URL |
| `is_enabled` | registered_sites | Whether proxying is enabled |
| `require_identities` | registered_sites | Force visitors to sign in |
| `exempt_matching_api_secret` | registered_sites | API secret bypass allowed |
| `group_id` | group_definitions | Group ID |
| `group_name` | group_definitions | Group nickname |
| `group_deny_access` | group_definitions | Whether group denies access |
| `identity_type` | group_inclusion_specs | Type of identity match |
| `identity_spec` | group_inclusion_specs | Identity value to match |
| `policy_id` | connection_policies | Policy ID |
| `policy_name` | connection_policies | Policy nickname |
| `policy_type` | connection_policies | `default` or `nsjwt` |
| `policy_spec` | connection_policies | `allow`, `deny`, or Nightscout subject |
| `schedule_id` | scheduled_policies | Schedule ID (if any) |
| `schedule_type` | scheduled_policies | Schedule type (e.g., `week`) |
| `fill_pattern` | scheduled_policies | Comma-separated permission specs |
| `schedule_segments` | scheduled_policies | Comma-separated time offsets |

### owner_group_usage

An aggregated view showing how each group is used across an owner's sites. Useful for identifying unused groups that can be deleted.

**Columns:**

| Column | Description |
|--------|-------------|
| `owner_ref` | Owner identifier |
| `group_id` | Group ID |
| `group_name` | Group nickname |
| `total` | Total ACL entries using this group |
| `num_sites_used` | Number of distinct sites using this group |
| `num_policy_used` | Number of distinct policies using this group |

### site_policy_overview

A comprehensive view of policies assigned to a site, including schedule information and aggregate counts. This view also has `INSTEAD OF` triggers for INSERT and UPDATE operations, allowing the control panel to create policies through the view.

**Key Columns:**

| Column | Description |
|--------|-------------|
| `id` | Connection policy ID |
| `owner_ref` | Owner identifier |
| `expected_name` | Site vanity name |
| `group_id` | Group assigned to this policy |
| `group_name` | Group nickname |
| `policy_name` | Policy display name |
| `policy_type` | `default` or `nsjwt` |
| `policy_spec` | Permission value |
| `schedule_id` | Schedule ID (if scheduled) |
| `schedule_name` | Schedule display name |
| `fill_pattern` | Time-based permission overrides |
| `schedule_segments` | Time segment boundaries |
| `identity_types` | Count of distinct identity types in group |
| `identity_specs` | Count of distinct identity specs in group |

## API Endpoints

### Synopsis (Dashboard Overview)

These endpoints provide high-level summaries for the control panel dashboard.

#### GET /api/v1/owner/:owner_ref/synopsis

Returns an overview of all sites owned by this owner.

**Response Structure:**
```json
{
  "query": { "owner_ref": "owner_abc123" },
  "data": [
    {
      "id": "site_001",
      "expected_name": "johndoe",
      "full_domain": "johndoe.t1pal.com",
      ...
    }
  ]
}
```

#### GET /api/v1/owner/:owner_ref/synopsis/:expected_name

Returns detailed overview of a specific site including registration status and site settings.

**Response Structure:**
```json
{
  "query": { "owner_ref": "owner_abc123", "expected_name": "johndoe" },
  "data": {
    "id": "site_001",
    "expected_name": "johndoe",
    "full_domain": "johndoe.t1pal.com",
    "nickname": "John's CGM",
    "upstream_origin": "https://johndoe.herokuapp.com",
    "is_enabled": true,
    "require_identities": true,
    "exempt_matching_api_secret": true,
    ...
  }
}
```

---

### ACL Management

#### GET /api/v1/owner/:owner_ref/acl

Returns all ACL entries for all sites owned by this owner.

**Use Case:** Control panel "All Sites" view showing complete access configuration.

**Response Structure:**
```json
{
  "query": { "owner_ref": "owner_abc123" },
  "data": [
    {
      "id": "site_001",
      "owner_ref": "owner_abc123",
      "expected_name": "johndoe",
      "full_domain": "johndoe.t1pal.com",
      "upstream_origin": "https://johndoe.herokuapp.com",
      "is_enabled": true,
      "require_identities": true,
      "group_id": "grp_001",
      "group_name": "School Nurses",
      "group_deny_access": false,
      "group_spec_id": "inc_001",
      "identity_type": "email",
      "identity_spec": "nurse@school.edu",
      "policy_id": "pol_001",
      "policy_name": "School Access",
      "policy_type": "nsjwt",
      "policy_spec": "careportal",
      "schedule_id": "sch_001",
      "schedule_nickname": "School Hours",
      "schedule_type": "week",
      "fill_pattern": "readable,careportal",
      "schedule_segments": "28800,57600"
    }
  ]
}
```

**Note:** The `full_domain` field is automatically computed by combining `expected_name` with the gateway apex domain.

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/acl

Returns ACL entries for a specific site.

**Use Case:** Site detail page showing who has access and what permissions.

---

### Site Management

#### GET /api/v1/owner/:owner_ref/sites/:expected_name

Returns the site ACL configuration (alias for the ACL endpoint).

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/available/groups

Returns groups owned by this user that have **zero site assignments** (unused groups).

**Use Case:** "Add Group" dropdown in the policy assignment UI, showing groups available to assign.

**Response Structure:**
```json
{
  "query": { "owner_ref": "owner_abc123", "num_sites_used": 0 },
  "data": [
    {
      "owner_ref": "owner_abc123",
      "group_id": "grp_002",
      "group_name": "Family Members",
      "total": 0,
      "num_sites_used": 0,
      "num_policy_used": 0
    }
  ]
}
```

**Note:** This returns groups with `num_sites_used = 0`, meaning groups not assigned to any site yet. Groups already assigned to other sites will not appear here.

#### DELETE /api/v1/owner/:owner_ref/sites/:expected_name

Deletes a registered site and its associated OAuth clients.

**Workflow:**
1. Fetches site overview
2. Finds associated OAuth clients
3. Removes OAuth clients from Hydra
4. Deletes local OAuth client records
5. Deletes the site registration

---

### Group Management

#### GET /api/v1/owner/:owner_ref/groups

Returns all groups owned by this user with usage statistics.

**Response:**
```json
{
  "query": { "owner_ref": "owner_abc123" },
  "data": [
    {
      "owner_ref": "owner_abc123",
      "group_id": "grp_001",
      "group_name": "School Nurses",
      "total": 5,
      "num_sites_used": 2,
      "num_policy_used": 3
    }
  ]
}
```

#### POST /api/v1/owner/:owner_ref/groups

Creates a new group with optional initial members.

**Required Fields:**
- `nickname` - Human-readable name for the group (required by Group entity config)
- `owner_ref` - Automatically set from URL path parameter

**Request Body:**
```json
{
  "nickname": "Family Members",
  "long_name": "Immediate Family",
  "description": "Parents and siblings who need full access",
  "deny_access": false,
  "identity_type": "email",
  "identity_spec": "mom@family.com",
  "includes": [
    { "identity_type": "email", "identity_spec": "dad@family.com" }
  ]
}
```

**Note:** You can provide initial members via:
- Top-level `identity_type` + `identity_spec` fields (single member)
- `includes` array (multiple members)
- Both can be combined
- Emails are normalized to lowercase before storage

**Processing:**
1. Entity config validation ensures `nickname` is provided
2. `owner_ref` is set from the URL path parameter (line 329 in lib/owner/index.js)
3. Group definition is created with generated ID
4. Inclusion specs are created for each member with the new group's ID

**Response Structure:**
```json
{
  "inserted": {
    "group": {
      "id": "grp_new123",
      "owner_ref": "owner_abc123",
      "nickname": "Family Members",
      "long_name": "Immediate Family"
    },
    "includes": [
      { "id": "inc_001", "group_definition_id": "grp_new123", "identity_type": "email", "identity_spec": "mom@family.com" },
      { "id": "inc_002", "group_definition_id": "grp_new123", "identity_type": "email", "identity_spec": "dad@family.com" }
    ]
  }
}
```

**Query Parameter:** `?dryrun=true` - Returns proposed `payload` object without creating database records.

#### GET /api/v1/owner/:owner_ref/groups/:group_id

Returns group details including all inclusion specs (members).

#### GET /api/v1/owner/:owner_ref/groups/:group_id/attributes

Returns group definition joined with attributes from `group_definitions` table.

#### POST /api/v1/owner/:owner_ref/groups/:group_id/attributes

Updates group attributes (nickname, long_name, description, deny_access).

#### DELETE /api/v1/owner/:owner_ref/groups/:group_id

Deletes a group definition. Note: This may fail if the group is currently assigned to policies.

---

### Group Membership (Inclusion Specs)

#### POST /api/v1/owner/:owner_ref/groups/:group_id/includes

Adds members to a group.

**Request Body:**
```json
{
  "includes": [
    { "identity_type": "email", "identity_spec": "newmember@example.com" }
  ]
}
```

Or single member:
```json
{
  "identity_type": "email",
  "identity_spec": "newmember@example.com"
}
```

**Email Normalization:** Emails are automatically lowercased before storage.

#### POST /api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type

Adds members of a specific identity type to a group.

#### GET /api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type

Lists all members of a group filtered by identity type.

**Response:**
```json
{
  "query": { "group_definition_id": "grp_001", "identity_type": "email" },
  "pagination": { "perPage": 10 },
  "results": {
    "data": [
      { "id": "inc_001", "identity_type": "email", "identity_spec": "nurse@school.edu" }
    ]
  }
}
```

#### GET /api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type/:identity_spec

Searches for a specific member in a group.

#### DELETE /api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type/:identity_spec

Removes a specific member from a group.

---

### Policy Assignment

These endpoints manage which groups have access to which sites and with what permissions.

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions

Returns all policies assigned to a site, ordered by sort priority.

**Response:**
```json
{
  "query": { "owner_ref": "owner_abc123", "expected_name": "johndoe" },
  "pagination": { "perPage": 10 },
  "results": {
    "data": [
      {
        "id": "pol_001",
        "group_id": "grp_001",
        "group_name": "School Nurses",
        "policy_name": "School Hours Access",
        "policy_type": "nsjwt",
        "policy_spec": "careportal",
        "sort": 10,
        "schedule_id": "sch_001",
        "schedule_name": "School Hours",
        "schedule_type": "week",
        "fill_pattern": "readable,careportal",
        "schedule_segments": "28800,57600",
        "identity_types": 1,
        "identity_specs": 3
      }
    ]
  }
}
```

#### POST /api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions

**Creates** a new policy assignment for a site. This endpoint inserts records via the `site_policy_overview` view's `INSTEAD OF INSERT` trigger.

**Important Constraints:**
- This endpoint **creates new policies only** - it does not update existing policies
- A group can only be assigned once per site (duplicate assignments are prevented by the trigger)
- Schedule creation requires **all three** schedule fields: `schedule_type`, `fill_pattern`, AND `schedule_segments`

**Required Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `owner_ref` | Yes (from URL) | Owner identifier |
| `expected_name` | Yes (from URL) | Site vanity name |
| `group_id` | Yes | The group to grant access |
| `policy_type` | Yes | `default` or `nsjwt` |
| `policy_spec` | Yes | Permission value |

**Optional Fields:**

| Field | Description |
|-------|-------------|
| `policy_name` | Display name (defaults to "Default") |
| `policy_note` | Optional notes |
| `schedule_type` | Schedule type (e.g., `week`) - requires all schedule fields |
| `fill_pattern` | Comma-separated permission specs for schedule |
| `schedule_segments` | Comma-separated time boundaries in seconds |

**Request Body (without schedule):**
```json
{
  "group_id": "grp_001",
  "policy_type": "nsjwt",
  "policy_spec": "careportal",
  "policy_name": "Nurse Access"
}
```

**Request Body (with schedule):**
```json
{
  "group_id": "grp_001",
  "policy_type": "nsjwt",
  "policy_spec": "careportal",
  "policy_name": "School Hours Access",
  "policy_note": "Nurses can bolus during school hours",
  "schedule_type": "week",
  "fill_pattern": "readable,careportal",
  "schedule_segments": "28800,57600"
}
```

**Response Structure (on successful insert):**
```json
{
  "suggestion": {
    "owner_ref": "owner_abc123",
    "expected_name": "johndoe",
    "group_id": "grp_001",
    "policy_type": "nsjwt",
    "policy_spec": "careportal",
    "policy_name": "School Hours Access",
    "schedule_type": "week",
    "fill_pattern": "readable,careportal",
    "schedule_segments": "28800,57600"
  },
  "inserted": {
    "err": null,
    "payload": {
      "id": "<generated-policy-id>",
      "schedule_id": "<generated-schedule-id>",
      "owner_ref": "owner_abc123",
      "expected_name": "johndoe",
      "group_id": "grp_001",
      "policy_type": "nsjwt",
      "policy_spec": "careportal",
      "policy_name": "School Hours Access"
    }
  }
}
```

**Note:** Generated IDs (`id`, `schedule_id`) are only available in `inserted.payload`, not in the `suggestion` object.

**Response Structure (on dryrun):**
```json
{
  "suggestion": {
    "owner_ref": "owner_abc123",
    "expected_name": "johndoe",
    "group_id": "grp_001",
    "policy_type": "nsjwt",
    "policy_spec": "careportal"
  },
  "payload": {
    "id": "<generated-policy-id>",
    "owner_ref": "owner_abc123",
    "expected_name": "johndoe",
    "group_id": "grp_001",
    "policy_type": "nsjwt",
    "policy_spec": "careportal"
  }
}
```

**Note:** On dryrun, there is no `inserted` field - only `suggestion` (the normalized input) and `payload` (what would be inserted, including generated IDs).

**Policy Types:** See [policies-and-permissions.md](./policies-and-permissions.md) for details on `policy_type` and `policy_spec` values.

**Query Parameter:** `?dryrun=true` - Returns proposed `payload` without creating records. The `inserted` field will be absent.

**To Update an Existing Policy:** Policy updates are not supported through this endpoint. Use the `site_policy_overview` view's `INSTEAD OF UPDATE` trigger via direct database operations or the generic entity endpoints.

---

### Inspections (BYOD Criteria)

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/inspections

Returns audit summaries for BYOD validation checks on this site.

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/inspections/:audit_id

Returns detailed results for a specific inspection audit.

---

### OAuth Clients

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/available/clients

Lists OAuth clients associated with this site.

#### POST /api/v1/owner/:owner_ref/sites/:expected_name/available/clients

Creates a new OAuth client for this site (integrates with Ory Hydra).

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/available/clients/:client_id

Returns details for a specific OAuth client.

---

### Token Management

#### GET /api/v1/owner/:owner_ref/sites/:expected_name/available/tokens

Lists available Nightscout JWT tokens for this site.

See [token-management.md](./token-management.md) for complete token exchange documentation.

---

## Common Workflows

### Workflow 1: Create a Group and Add Members

```
1. POST /api/v1/owner/:owner_ref/groups
   Body: { 
     "nickname": "School Staff",
     "identity_type": "email",
     "identity_spec": "nurse@school.edu",
     "includes": [
       { "identity_type": "email", "identity_spec": "aide@school.edu" }
     ]
   }
   → Returns: { inserted: { group: {...}, includes: [...] } }
   
2. (Optional) Add more members later:
   POST /api/v1/owner/:owner_ref/groups/:group_id/includes
   Body: { "identity_type": "email", "identity_spec": "sub@school.edu" }
   → Returns: { inserted: { includes: [...] } }
```

### Workflow 2: Assign Group to Site with Scheduled Access

```
1. GET /api/v1/owner/:owner_ref/groups
   → Lists all owner's groups with usage stats
   
2. POST /api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions
   Body: {
     "group_id": "grp_001",
     "policy_type": "nsjwt",
     "policy_spec": "careportal",
     "policy_name": "School Hours Access",
     "schedule_type": "week",
     "fill_pattern": "readable,careportal",
     "schedule_segments": "28800,57600"
   }
   
   Note: All three schedule fields are required to create a schedule.
   Without them, only the base policy is created.
```

### Workflow 3: View Complete Site Access Configuration

```
1. GET /api/v1/owner/:owner_ref/synopsis/:expected_name
   → Site overview with registration status and settings
   
2. GET /api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions
   → All policies with groups, schedules, and aggregate counts
   
3. For each group needing member details:
   GET /api/v1/owner/:owner_ref/groups/:group_id
   → Group inclusion specs (members)
```

### Workflow 4: Remove a Group Member

```
1. GET /api/v1/owner/:owner_ref/groups/:group_id/includes/email
   → List email members of the group
   
2. DELETE /api/v1/owner/:owner_ref/groups/:group_id/includes/email/nurse@school.edu
   → Removes specific member from group
   → Returns 204 No Content
```

### Workflow 5: Delete an Unused Group

```
1. GET /api/v1/owner/:owner_ref/groups
   → Check num_sites_used to find groups not assigned to any site
   
2. DELETE /api/v1/owner/:owner_ref/groups/:group_id
   → Deletes the group definition
   → Note: May fail if group has active policy assignments
```

### Workflow 6: Delete a Site

```
1. DELETE /api/v1/owner/:owner_ref/sites/:expected_name
   → Handler chain:
      a. Fetches site overview
      b. Finds associated OAuth clients
      c. Removes OAuth clients from Hydra
      d. Deletes local OAuth client records
      e. Deletes the site registration
   → Returns 204 No Content
```

## Error Handling

All endpoints return standard Restify error responses:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 204 | Success (no content, for DELETE operations) |
| 400 | Bad request (missing required fields) |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate group assignment) |
| 500 | Server error |

## Related Documentation

- [policies-and-permissions.md](./policies-and-permissions.md) - Deep dive on policy_type, policy_spec, and schedules
- [token-management.md](./token-management.md) - NSJWT token exchange details
- [site-registration-workflow.md](./site-registration-workflow.md) - How sites are registered
- [access-modes.md](./access-modes.md) - The three access conditions (Anonymous, Identity-Mapped, Legacy)
