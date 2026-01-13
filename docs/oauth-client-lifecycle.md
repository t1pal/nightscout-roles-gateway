# OAuth Client Lifecycle

This document describes how OAuth clients are managed within the Nightscout Roles Gateway. OAuth clients represent tenant authorization endpoints, enabling the invitation/consent flow for followers to join a Nightscout owner's group.

## Overview

Each registered Nightscout site has an associated OAuth client that:

1. Represents the tenant's authorization endpoint in Ory Hydra
2. Enables the RSVP (invitation acceptance) consent flow
3. Maps follower identities to Nightscout-specific authorizations

The OAuth client lifecycle is managed through a dual-storage pattern:
- **Ory Hydra**: Mints and transacts on OAuth credentials, handles actual OAuth flows
- **Local Database**: Maps `owner_ref` and `expected_name` to Hydra's `client_id`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OAuth Client Architecture                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Kratos     │     │    NRG       │     │    Hydra     │
│  (Identity)  │◄───▶│  (Gateway)   │◄───▶│   (OAuth)    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    ▼
   Who you are       Glue layer that       Credential minting
                     maps identities       Token transactions
                     to Nightscout         OAuth flow handling
                     authorizations
```

## Client Lifecycle

OAuth clients follow a create-only lifecycle. Updates and credential rotation are not currently supported.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OAuth Client Lifecycle                               │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   Suggest    │────▶│   Create in  │────▶│   Record in  │
  │   Defaults   │     │    Hydra     │     │   Local DB   │
  └──────────────┘     └──────────────┘     └──────────────┘
         │                    │                    │
         │                    │                    │
         ▼                    ▼                    ▼
    Prepares config      Mints client_id     Persists mapping
    based on tenant      and client_secret   for lookups
         │
         │
         ▼
  ┌──────────────┐                          ┌──────────────┐
  │    Find      │◄─────────────────────────│    Remove    │
  │   Clients    │                          │   Clients    │
  └──────────────┘                          └──────────────┘
         │                                         │
         ▼                                         ▼
    Query by owner_ref,                      Deletes from Hydra
    expected_name, or                        (local cleanup TBD)
    client_id
```

### Lifecycle Stages

| Stage | Function | Description |
|-------|----------|-------------|
| **Suggest** | `suggest_new_client` | Prepares default client configuration based on `owner_ref` and `expected_name` |
| **Create** | `create_hydra_client` | Calls Hydra Admin API to mint `client_id` and `client_secret` |
| **Record** | `record_new_client` | Persists client credentials to local `oauth2_credentials` table |
| **Find** | `find_oath_clients` | Queries local DB by `owner_ref`, `expected_name`, or `client_id` |
| **Find by ID** | `find_oath_client_by_id` | Retrieves specific client by `client_id` |
| **Remove** | `remove_oauth_hydra_clients` | Deletes clients from Hydra |

## Data Model

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `owner_ref` | Tenant identifier - tracks who owns this set of resources | `"owner_abc123"` |
| `expected_name` | User-chosen vanity subdomain (must be DNS-safe) | `"diabetes-dad"` |

### Stored Fields (oauth2_credentials table)

| Field | Description | Source |
|-------|-------------|--------|
| `id` | Local record ID | Auto-generated |
| `owner_ref` | Tenant identifier | From request |
| `expected_name` | Vanity subdomain | From request |
| `client_id` | OAuth client ID | From Hydra |
| `client_secret` | OAuth client secret | From Hydra |

### Table Configuration

```javascript
{
  table: 'oauth2_credentials',
  kind: 'OAuth2Client',
  required: ['owner_ref', 'expected_name'],
  search_singular: ['id'],
  mutable: [],
  readonly: ['id', 'owner_ref']
}
```

Note: The `mutable: []` configuration indicates that no fields can be updated after creation.

## Default Client Configuration

When a new client is suggested, the following defaults are applied:

### Audience

```javascript
audience: [
  `${expected_name}.${apex}`,                              // Tenant subdomain
  `${www}/invitations/${expected_name}`                    // Invitation endpoint
]
```

### Redirect URIs

```javascript
redirect_uris: [
  `${www}/invitations/${expected_name}/rsvp`               // RSVP callback
]
```

### Scopes

```
openid email offline profile rsvp
```

| Scope | Purpose |
|-------|---------|
| `openid` | Standard OIDC identity |
| `email` | Access to user's email |
| `offline` | Refresh token support |
| `profile` | Basic profile information |
| `rsvp` | Custom scope - consent to join the Nightscout owner's group |

### Subject Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `subject_type` | `pairwise` | User gets different `sub` claim per client for privacy |
| `token_endpoint_auth_method` | `client_secret_post` | Client authenticates via POST body |
| `sector_identifier_url` | `/api/v1/owner/{owner_ref}/sites/{expected_name}/oauth/sector_identifier` | Required for pairwise subjects |

### Metadata

```javascript
metadata: {
  expected_name: '<vanity_subdomain>',
  owner_ref: '<tenant_id>'
}
```

## Invitation/RSVP Flow

The OAuth client enables followers to consent to sharing their identity with a Nightscout owner.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Invitation/RSVP Flow                               │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Owner   │     │ Follower │     │  Hydra   │     │   NRG    │
  │  Invites │────▶│  Clicks  │────▶│  Consent │────▶│  Records │
  │          │     │  Link    │     │  Screen  │     │  Join    │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘
       │                │                │                │
       │                │                │                │
       ▼                ▼                ▼                ▼
  Creates invite   Redirected to    User consents    Redirect to
  with vanity      OAuth flow       to share         /rsvp captures
  URL                               identity         group membership
```

### Flow Steps

1. **Owner creates invitation**: Shares a link containing the vanity URL
2. **Follower clicks link**: Initiates OAuth authorization flow
3. **Hydra presents consent**: User sees what they're consenting to (the `rsvp` scope)
4. **User consents**: Agrees to share identity with the Nightscout owner
5. **Redirect to RSVP**: The callback URL (`/invitations/{name}/rsvp`) captures the consent
6. **Group membership recorded**: NRG records that the follower has joined the owner's group

### What the `rsvp` Scope Means

When a follower consents to the `rsvp` scope, they are agreeing that:
- The Nightscout owner can see their identity (email, profile)
- They are joining the owner's follower group
- They may be granted access according to the owner's policies

## API Endpoints

All client management is performed through middleware handlers that operate on `res.locals`.

### Suggest New Client

Prepares default client configuration without creating it.

**Handler:** `suggest_new_client`

**Input (from request):**
- `owner_ref` (required): Tenant identifier
- `expected_name` (required): Vanity subdomain

**Output (to res.locals):**
- `default_client`: Generated configuration
- `incoming`: Merged request parameters
- `suggestion`: Configuration to be used for creation

### Create Client

Creates the OAuth client in Hydra using the suggestion.

**Handler:** `create_hydra_client`

**Input (from res.locals):**
- `suggestion`: Client configuration from `suggest_new_client`

**Output (to res.locals):**
- `client`: Hydra response including `client_id` and `client_secret`

### Record Client

Persists client credentials to local database.

**Handler:** `record_new_client`

**Input (from res.locals):**
- `incoming`: Original request parameters
- `client`: Hydra response

**Output (to res.locals):**
- `inserted`: The database record

### Find Clients

Query clients by various criteria.

**Handler:** `find_oath_clients`

**Input (from request):**
- `owner_ref` (optional): Filter by tenant
- `expected_name` (optional): Filter by vanity name
- `client_id` (optional): Filter by OAuth client ID

**Output (to res.locals):**
- `results.data`: Array of matching clients

### Find Client by ID

Retrieve a specific client by `client_id`.

**Handler:** `find_oath_client_by_id`

**Input (from request):**
- `client_id` (required): The OAuth client ID

**Output (to res.locals):**
- `results.data`: The matching client (or empty)

### Remove Clients

**Handler:** `remove_oauth_hydra_clients`

**Input (from res.locals):**
- `results.data`: Array of clients to remove (from a prior `find_oath_clients` call)

**Current Status:** NOT FUNCTIONAL

> **Bug:** The current implementation maps clients to functions but never invokes them.
> `Promise.all(removals)` receives an array of functions, not promises, so no deletions occur.
> See [Open Questions](#open-questions--future-work) for remediation.

### Fetch Callback URLs

Returns the redirect URIs for a client.

**Handler:** `fetch_callback_urls`

**Input (from res.locals):**
- `suggestion`: Client configuration

**Output:**
- JSON response with `redirect_uris` array

## Dependencies

### Required Services

| Service | Purpose | Must Be Running |
|---------|---------|-----------------|
| **Ory Hydra** | OAuth2/OIDC provider | Yes |
| **Ory Kratos** | Identity management | Yes |
| **PostgreSQL** | Local credential storage | Yes |

### Configuration

The client module requires the following configuration options:

```javascript
opts: {
  hydra: {
    api: 'http://hydra-admin:4445'    // Hydra Admin API URL
  },
  gateway: {
    apex: 'example.com',               // Base domain for tenants
    www: 'https://www.example.com'     // WWW frontend URL
  },
  self: {
    api: 'https://api.example.com'     // This service's API URL
  }
}
```

### Related Projects

| Project | Description |
|---------|-------------|
| [nightscout-gateway-www](https://github.com/t1pal/nightscout-gateway-www) | Frontend dashboard for consent and vanity URL viewing |

## Open Questions / Future Work

### Known Bugs

| Bug | Location | Description |
|-----|----------|-------------|
| **Remove not functional** | `remove_oauth_hydra_clients` | Maps to functions but never invokes them. `Promise.all` receives functions, not promises. |

**Fix required:** Change `return remove;` to `return remove();` to actually execute the deletions.

### Not Yet Implemented

| Feature | Current State | Impact |
|---------|---------------|--------|
| **Client Update** | No update function exists | Cannot rotate credentials |
| **Client Rotation** | `mutable: []` prevents changes | Security concern for long-lived clients |
| **Local DB Cleanup** | Remove intended to delete from Hydra only | Orphaned local records possible (blocked by bug above) |

### Consistency Concerns

| Scenario | Current Behavior | Risk |
|----------|------------------|------|
| Hydra create succeeds, local DB fails | Client exists in Hydra but not tracked locally | Orphaned Hydra client |
| Hydra delete fails | Error logged, continues | Orphaned Hydra client |
| Hydra unavailable | Create fails | User-visible error |

### Recommended Improvements

1. **Add reconciliation job**: Periodic sync between Hydra and local DB
2. **Implement credential rotation**: Support for updating `client_secret`
3. **Transactional create**: Roll back Hydra client if local DB write fails
4. **Soft delete**: Mark clients as deleted locally before removing from Hydra
5. **Audit logging**: Track client lifecycle events for debugging

### Production Readiness Checklist

- [ ] Credential rotation support
- [ ] Reconciliation between Hydra and local DB
- [ ] Error recovery for partial failures
- [ ] Audit logging for client operations
- [ ] Rate limiting on client creation
- [ ] Cleanup of orphaned clients
