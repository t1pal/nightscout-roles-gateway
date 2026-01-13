# Site Registration Workflow

This document describes how Nightscout sites are registered with NRG. The registration workflow is the entry point for users to connect their Nightscout instances to the gateway.

## Overview

When a user registers a Nightscout site, NRG:

1. Validates the registration request
2. Checks name/origin availability against reserved patterns
3. Creates the site record with auto-generated access control resources
4. Optionally validates the upstream Nightscout (BYOD criteria check)

The workflow produces a complete access control chain: Site → Group → Inclusion Spec → Policy.

## Registration Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Site Registration Lifecycle                          │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Suggest │────▶│  Check   │────▶│  Insert  │────▶│  Active  │
  │          │     │Available │     │          │     │          │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘
       │                │                                  │
       │                │                                  │
       ▼                ▼                                  ▼
   Validation       Reserved?                        ┌──────────┐
   Errors           → 400                            │  Update  │
                                                     │  Props   │
                                                     └──────────┘
                                                          │
                                                          ▼
                                                     ┌──────────┐
                                                     │ Factory  │
                                                     │  Reset   │
                                                     └──────────┘
                                                          │
                                                          ▼
                                                     ┌──────────┐
                                                     │  Remove  │
                                                     └──────────┘
```

## Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `owner_ref` | Unique identifier of the site owner | `"owner_abc123"` |
| `expected_name` | Vanity name for the site (becomes subdomain) | `"mysite"` |
| `upstream_origin` | URL of the Nightscout instance | `"https://my-ns.herokuapp.com"` |

## Optional Fields

| Field | Description | Default |
|-------|-------------|---------|
| `site_name` | Human-readable display name | `null` |
| `api_secret` | Nightscout API secret (for BYOD validation) | `null` |
| `client_app` | Client application identifier | `null` |

## Auto-Created Resources

When a site is registered, NRG automatically creates a default access control chain:

### Default Group

```javascript
{
  owner_ref: "<owner_ref>",
  nickname: "Default"
}
```

### Default Inclusion Spec (Role)

```javascript
{
  identity_type: "anonymous",
  identity_spec: "all"
}
```

This grants access to anyone (Mode A: Anonymous Access).

### Default Policy

```javascript
{
  policy_name: "Default",
  policy_type: "default",
  policy_spec: "allow"
}
```

Together, these resources create a site that is publicly accessible at its vanity URL, matching the behavior of a traditional self-hosted Nightscout.

## API Endpoints

All registration endpoints return data wrapped in `res.locals`, so responses have properties like `suggestion` or `workflow` at the top level.

### Preview Registration (No Commit)

**Endpoint:** `GET /api/v1/workflows/site/registrations`

Returns a preview of what would be created without committing anything. This endpoint does NOT provision OAuth clients, so the `suggestion` object retains the full Site/Group/Policy scaffold.

**Query Parameters:**
- `owner_ref` (required)
- `expected_name` (required)
- `upstream_origin` (required)

**Response:**
```json
{
  "suggestion": {
    "Gateway": { ... },
    "Site": { "owner_ref": "...", "expected_name": "...", "upstream_origin": "..." },
    "Group": { "owner_ref": "...", "nickname": "Default" },
    "Role": { "identity_type": "anonymous", "identity_spec": "all" },
    "Policy": { "policy_name": "Default", "policy_type": "default", "policy_spec": "allow" },
    "Request": { ... }
  }
}
```

**Note:** Unlike the create endpoints, the preview/propose endpoints preserve the Site/Group/Policy structure in `suggestion` because they don't run through the OAuth client handlers.

### Check Availability

**Endpoint:** `GET /api/v1/workflows/site/registrations/:expected_name`

Checks if the expected name is available (not reserved or blocked).

**Query Parameters:**
- `skip=lint` - If set, skips the availability check entirely

**Response (available):**
```json
{
  "suggestion": {
    "Gateway": { ... },
    "Site": { ... },
    "Group": { ... },
    "Role": { ... },
    "Policy": { ... },
    "Request": { ... },
    "available": true,
    "problems": { "names": [], "origins": [], "total": 0 }
  }
}
```

**Response (unavailable - HTTP 400):**
```json
{
  "suggestion": {
    ...
    "available": false,
    "problems": { "names": [...], "origins": [...], "total": 2 }
  }
}
```

**Note:** The `ok` field in the response is currently always `undefined` due to a bug in the implementation (`total.length` instead of `total`). The `available` field correctly indicates name availability.

### Propose Registration

**Endpoint:** `POST /api/v1/workflows/site/registrations/:expected_name/propose`

Similar to preview, but via POST. Returns the suggestion without committing.

**Response:**
```json
{
  "suggestion": {
    "Gateway": { ... },
    "Site": { ... },
    "Group": { ... },
    "Role": { ... },
    "Policy": { ... },
    "Request": { ... }
  }
}
```

### Create Registration

**Endpoint:** `POST /api/v1/workflows/site/registrations`

Creates a new site registration with all associated resources. This endpoint also provisions an OAuth2 client via Hydra for the site.

**Request Body:**
```json
{
  "owner_ref": "owner_abc123",
  "expected_name": "mysite",
  "upstream_origin": "https://my-ns.herokuapp.com",
  "site_name": "My Nightscout",
  "api_secret": "my-12-char-secret"
}
```

**Response:**
```json
{
  "default_client": {
    "audience": ["mysite.gateway.example.com", "..."],
    "client_name": "mysite",
    "metadata": { "expected_name": "mysite", "owner_ref": "owner_abc123" },
    "owner": "owner_abc123",
    "redirect_uris": ["..."],
    "scope": "openid email offline profile rsvp",
    "sector_identifier_url": "...",
    "subject_type": "pairwise",
    "token_endpoint_auth_method": "client_secret_post"
  },
  "incoming": {
    "owner_ref": "owner_abc123",
    "expected_name": "mysite",
    "upstream_origin": "https://my-ns.herokuapp.com"
  },
  "suggestion": {
    "audience": [...],
    "client_name": "mysite",
    ...
  },
  "workflow": {
    "type": "registration",
    "payload": {
      "id": "generated-uuid",
      "owner_ref": "owner_abc123",
      "expected_name": "mysite",
      "upstream_origin": "https://my-ns.herokuapp.com",
      "site_name": "My Nightscout",
      "group_id": "generated-uuid",
      "group_name": "Default",
      "group_spec_id": "generated-uuid",
      "identity_type": "anonymous",
      "identity_spec": "all",
      "policy_id": "generated-uuid",
      "policy_name": "Default",
      "policy_type": "default",
      "policy_spec": "allow"
    },
    "inserted": {
      "error": "<knex-driver-return>",
      "registration": { ... }
    }
  },
  "client": {
    "client_id": "hydra-client-id",
    "client_secret": "hydra-client-secret",
    "client_name": "mysite",
    ...
  },
  "inserted": {
    "id": "generated-uuid",
    "owner_ref": "owner_abc123",
    "expected_name": "mysite",
    "client_id": "hydra-client-id",
    "client_secret": "hydra-client-secret"
  }
}
```

**Important notes:**

- The `suggestion` field is overwritten by the OAuth client handlers and contains client metadata, not the original Site/Group/Policy structure. The original registration details (site, group, policy) are preserved in `workflow.payload`.
- The `workflow.inserted.error` field contains the raw Knex driver return value (typically an array or row count), not `null`. Its exact contents are implementation-defined.
- The `client` field contains the full OAuth2 client as created in Hydra.
- The top-level `inserted` field contains the credentials record stored locally in `oauth2_credentials`.

### Create Registration (with expected_name in path)

**Endpoint:** `POST /api/v1/workflows/site/registrations/:expected_name`

Same as above, but `expected_name` is in the URL path.

### Get Existing Registration

**Endpoint:** `GET /api/v1/workflows/site/registrations/:owner_ref/:expected_name`

Retrieves an existing registration by owner and name.

**Response:**
```json
{
  "registration": {
    "id": "...",
    "owner_ref": "...",
    "expected_name": "...",
    "upstream_origin": "...",
    ...
  }
}
```

### Update Registration Properties

**Endpoint:** `POST /api/v1/workflows/site/registrations/:owner_ref/:expected_name/props`

Updates mutable properties on an existing registration.

**Mutable Fields:**
- `site_name`
- Other fields defined in `Site.cfg.mutable`

**Readonly Fields (cannot be changed):**
- `owner_ref`
- `expected_name`

**Response:**
```json
{
  "suggestion": { ... },
  "updated": { "site_name": "New Name", ... },
  "registration": { ... }
}
```

### Validate Authenticity (BYOD)

**Endpoint:** `POST /api/v1/workflows/site/registrations/:owner_ref/:expected_name/authenticity`

Runs the criteria validation pipeline against the upstream Nightscout and records results.

This endpoint:
1. Updates registration properties
2. Runs the criteria audit (`triage` handler)
3. Records the audit results to the database

See [Criteria System](./criteria-system.md) for details on the validation pipeline.

### Factory Reset

**Endpoint:** `POST /api/v1/workflows/site/registrations/:owner_ref/:expected_name/factory-reset`

Resets a registration to its initial state while preserving the site ID. This:
- Generates new IDs for group, group_spec, and policy
- Preserves the original site ID
- Sets `factory_reset = 1` flag

Use this to clear custom policies and groups and return to the default access configuration.

**Response:**
```json
{
  "suggestion": { ... },
  "registration": { ... },
  "reset_request": { ... },
  "workflow": {
    "type": "registration",
    "payload": { ... },
    "updated": {
      "error": null,
      "registration": { ... }
    }
  }
}
```

### Remove Registration

**Endpoint:** `DELETE /api/v1/owner/:owner_ref/sites/:expected_name`

Deletes the registration and associated resources, including OAuth clients from Hydra.

**Response:** HTTP 204 with JSON body (implementation quirk)

```json
{
  "query": { "owner_ref": "...", "expected_name": "..." },
  "data": {
    "id": "...",
    "owner_ref": "...",
    "expected_name": "...",
    "nickname": "...",
    "upstream_origin": "...",
    "is_enabled": true,
    ...
  },
  "results": { "data": [...] },
  "removed": 1,
  "registration": 1
}
```

The response includes:
- `query`, `data`: Site synopsis from `get_site_overview` handler
- `results`: OAuth clients found before deletion
- `removed`, `registration`: Deletion confirmation counts

**Note:** The implementation sets status 204 but still returns a JSON body. This is technically non-standard (204 should have no body), but consumers should expect both the status code and the body.

## Name/Origin Reservation

NRG maintains a `disallowed_site_info` table with reserved patterns. Registrations are blocked if:

- `expected_name` matches any `reserved_name` pattern (using SQL `SIMILAR TO`)
- `upstream_origin` matches any `reserved_origin` pattern

This prevents:
- Squatting on common names
- Registering known-bad upstream origins
- Impersonation of official sites

## Integration with Criteria System

When registering a BYOD (Bring Your Own Nightscout) site, the authenticity endpoint runs validation:

```
POST /api/v1/workflows/site/registrations/:owner/:name/authenticity
         │
         ▼
   ┌──────────────┐
   │ Update Props │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │   Triage     │◀── Runs criteria inspection pipeline
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Record       │──▶ nightscout_inspection_results
   │ Criteria     │──▶ nightscout_inspection_details
   └──────────────┘
```

Sites that fail mandatory criteria cannot proceed with registration.

## Database Tables

| Table | Purpose |
|-------|---------|
| `site_registration_initializations` | Staging table for registration workflow |
| `registered_sites` | Active registered sites |
| `group_definitions` | Group metadata (auto-created Default group) |
| `group_inclusion_specs` | Identity matching rules (auto-created anonymous spec) |
| `connection_policies` | Site-group access policies (auto-created allow policy) |
| `oauth2_credentials` | OAuth2 client credentials (client_id, client_secret) from Hydra |
| `disallowed_site_info` | Reserved names and origins |
| `nightscout_inspection_results` | BYOD audit summaries |
| `nightscout_inspection_details` | BYOD audit individual criteria |

## Error Handling

Error responses may bypass the normal `suggestion`/`workflow` envelope structure.

### Validation Errors (short-circuit, bypass envelope)

These errors occur in `suggest_registration` and **immediately terminate the request pipeline**. No downstream handlers run (no registration is attempted, no OAuth client is created). The response is a bare JSON object without envelope:

| Error | HTTP Status | Response Body |
|-------|-------------|---------------|
| Missing required fields | 400 | `{ "missing": ["owner_ref", "expected_name", ...] }` |
| Banned fields | 400 | `{ "banned": { "id": "..." } }` |

When `insert_new_site_registration` detects a pre-existing site:

| Error | HTTP Status | Response Body |
|-------|-------------|---------------|
| Pre-existing registration | 400 | `{ "ok": false, "err": {...} }` |

### Availability Errors (wrapped in suggestion)

These errors occur after `suggest_registration` succeeds but `check_suggestion_available` finds a conflict. The response still contains the `suggestion` envelope but with an HTTP 400 status:

| Error | HTTP Status | Behavior |
|-------|-------------|----------|
| Name unavailable | 400 | `suggestion.available = false`, `suggestion.problems.names` populated |
| Origin blocked | 400 | `suggestion.available = false`, `suggestion.problems.origins` populated |

The `problems` object structure:
```json
{
  "names": [...],      // Array of matching reserved name patterns
  "origins": [...],    // Array of matching reserved origin patterns  
  "total": 2           // Integer: sum of names.length + origins.length
}
```

## Customization After Registration

After the default registration, owners can:

1. **Add groups** - Create groups with specific email inclusion specs
2. **Add policies** - Link groups to the site with custom permissions
3. **Add schedules** - Apply time-based access rules to policies
4. **Enable identity mode** - Set `require_identities: true` on the site
5. **Enable API secret escape hatch** - Set `exempt_matching_api_secret: true`

See [Policies and Permissions](./policies-and-permissions.md) for details on configuring access control beyond the defaults.

## Code Location

| Component | File |
|-----------|------|
| Registration handlers | `lib/registrations/index.js` |
| OAuth client provisioning | `lib/clients/index.js` |
| Route definitions | `lib/routes.js` (lines 144-184) |
| Criteria integration | `lib/criteria/index.js` |
| Entity persistence | `lib/entities/index.js` |

## Related Documentation

- [Access Modes](./access-modes.md) - Understanding the three access conditions
- [Policies and Permissions](./policies-and-permissions.md) - Customizing access control
- [Criteria System](./criteria-system.md) - BYOD validation pipeline
