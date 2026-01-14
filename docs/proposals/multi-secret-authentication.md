# Proposal: Multi-Secret API Authentication with Role Mapping

**Status:** Draft  
**Author:** NRG Development Team  
**Date:** January 2026  
**Related Proposals:** Token Management, Control Panel, Audit Logging

---

## Executive Summary

Expand NRG's legacy API secret capability from a single shared secret to a managed collection of named credentials, each optionally mapped to specific Nightscout authorization subjects. This enables secret rotation, per-device credentials, and least-privilege access for uploaders like Loop and Trio—without requiring changes to those uploader applications.

---

## Problem Statement

### Current Limitations

1. **Single API secret = single point of failure** - Rotation requires coordinating all devices simultaneously
2. **Uniform access** - All API secret holders get identical permissions (full escape hatch)
3. **No attribution** - No visibility into which device/person made a request
4. **All-or-nothing revocation** - Revoking one user means changing the secret for everyone
5. **Shared credentials** - Long-lived uploader credentials (Loop, Trio) share the same secret as caregivers

### User Impact

- Operators avoid rotating secrets because it breaks all connected devices
- No way to give caregivers limited access via API secret
- No audit trail distinguishing Loop uploads from Trio uploads
- Compromised secret requires immediate action affecting all users

---

## Proposed Capabilities

### Tier 1: Multi-Secret List (Foundation)

| Feature | Description |
|---------|-------------|
| **Named Secrets** | Each secret has a human-readable name (e.g., "loop-iphone", "trio-watch", "grandma") |
| **Multiple Valid Secrets** | Any matching secret in the list grants access |
| **Independent Revocation** | Remove one secret without affecting others |
| **Creation Metadata** | Track created date, last used timestamp, usage count |

### Tier 2: Secret-to-Subject Mapping

| Feature | Description |
|---------|-------------|
| **Subject Association** | Each secret optionally maps to a Nightscout subject |
| **Automatic NSJWT Injection** | When secret matches, exchange its mapped subject for JWT |
| **Graduated Access** | "loop-phone" gets `devicestatus:create`, "school-nurse" gets `careportal:*` |
| **Fallback Behavior** | Secrets without mapping get legacy escape hatch (full access) |

### Tier 3: Secret Lifecycle Management

| Feature | Description |
|---------|-------------|
| **Expiration Dates** | Optional expiry for planned rotation |
| **Grace Period** | Old secret remains valid for configurable period after deprecation |
| **Status States** | Active, Deprecated, Revoked, Expired |
| **Rotation Workflow** | Create new → mark old deprecated → revoke after transition period |

### Tier 4: Observability & Audit

| Feature | Description |
|---------|-------------|
| **Request Attribution** | Log which named secret was used per request |
| **Usage Analytics** | "loop-phone last seen 2 hours ago" |
| **Alerting Hooks** | Notify on deprecated secret usage, unknown secret attempts |
| **Control Panel Dashboard** | Visual secret management with usage stats |

### Tier 5: Advanced Scenarios

| Feature | Description |
|---------|-------------|
| **Per-Secret Rate Limits** | Constrain specific devices |
| **Time-Based Access** | School nurse secret only works during school hours |
| **Auto-Discovery Integration** | Sync available subjects from Nightscout for mapping dropdown |
| **Bulk Operations** | Rotate all secrets, export/import configurations |

---

## Technical Approach

### Schema Design

```sql
CREATE TABLE api_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id VARCHAR REFERENCES registered_sites(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  hashed_secret VARCHAR(40) NOT NULL,  -- SHA1 hex
  mapped_subject VARCHAR(100),          -- Nightscout subject name
  status VARCHAR(20) DEFAULT 'active',  -- active, deprecated, revoked, expired
  expires_at TIMESTAMP,
  deprecated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  
  UNIQUE(site_id, name),
  UNIQUE(site_id, hashed_secret)
);

CREATE INDEX idx_api_secrets_lookup ON api_secrets(hashed_secret, status);
```

### Configuration via Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NRG_MAX_SECRETS_PER_SITE` | Maximum secrets allowed per site | 50 |
| `NRG_DEPRECATED_SECRET_POLICY` | Behavior for deprecated secrets: `warn`, `log_only`, `block` | `warn` |
| `NRG_DEPRECATED_GRACE_DAYS` | Days before deprecated secrets auto-expire | 30 |
| `NRG_LOG_SECRET_USAGE` | Enable per-request secret attribution logging | `true` |

### Request Flow (Enhanced Mode C)

```
API-SECRET header present?
  └─ Find matching secret in api_secrets table
     └─ Check status:
        ├─ expired/revoked → Reject (401)
        ├─ deprecated → Apply policy (warn/log/block)
        └─ active → Continue
           └─ Update last_used_at, usage_count
              └─ Has mapped_subject?
                 ├─ Yes → Exchange for NSJWT, inject X-NSJWT header
                 └─ No → Grant escape hatch (legacy behavior)
```

### REST API Endpoints

#### List Secrets for Site
```
GET /api/sites/{site_id}/secrets
Authorization: Bearer {admin_token}

Response:
[
  {
    "id": "uuid",
    "name": "loop-iphone",
    "status": "active",
    "mapped_subject": "device-uploader",
    "created_at": "2026-01-14T...",
    "last_used_at": "2026-01-14T...",
    "usage_count": 4523,
    "expires_at": null
  }
]
```

#### Create Secret
```
POST /api/sites/{site_id}/secrets
Authorization: Bearer {admin_token}

// Option A: Server-generated secret
{
  "name": "loop-iphone",
  "mapped_subject": "device-uploader",
  "expires_at": "2027-01-14T00:00:00Z"
}

// Option B: User-provided secret
{
  "name": "loop-iphone",
  "secret": "user-provided-secret-value",
  "mapped_subject": "device-uploader"
}

Response:
{
  "id": "uuid",
  "name": "loop-iphone",
  "secret": "generated-or-echoed-secret",  // Only returned on create
  "status": "active",
  ...
}
```

#### Update Secret Status
```
PATCH /api/sites/{site_id}/secrets/{secret_id}
Authorization: Bearer {admin_token}

{
  "status": "deprecated",
  "mapped_subject": "new-subject"
}
```

#### Delete Secret
```
DELETE /api/sites/{site_id}/secrets/{secret_id}
Authorization: Bearer {admin_token}
```

---

## Migration Path

### Phase 1: Database Migration
- Create `api_secrets` table
- Migrate existing `nightscout_secrets.hashed_api_secret` to `api_secrets` with name "legacy-primary"
- Keep `nightscout_secrets` table for backward compatibility during transition

### Phase 2: Dual-Path Validation
- Check `api_secrets` table first
- Fall back to `nightscout_secrets` if no match (for sites not yet migrated)
- Log which path was used for monitoring

### Phase 3: Full Migration
- All sites migrated to `api_secrets`
- `nightscout_secrets` becomes read-only reference
- Eventually deprecate old table

---

## Interplay with Other Proposals

| Topic | Relationship |
|-------|--------------|
| **Token Management** | Subject mapping leverages existing NSJWT exchange in `lib/exchanged.js` |
| **Authorization Discovery** | Could auto-populate subject dropdown for mapping UI |
| **Control Panel** | Primary UI for secret management; decides between server-generated vs user-provided |
| **Audit Logging** | Secret attribution feeds into logging infrastructure |
| **Schedule-Based Access** | Time restrictions could layer with secret-level rules |

---

## Relationship to Nightscout Subject System

### Background: Nightscout Already Has Multi-Credential Support

Nightscout Core's **subject system** provides per-identity credentials with role-based permissions:

```
Nightscout Subjects (existing in NS Core):
├── "readable" → access token: abc123 → roles: [readable]
├── "careportal" → access token: def456 → roles: [careportal, readable]
├── "admin" → access token: ghi789 → roles: [admin]
└── "loop-uploader" → access token: jkl012 → roles: [devicestatus]
```

Each subject has a name, an access token (long-lived credential), and mapped roles with specific Shiro permissions. This is conceptually similar to the multi-secret proposal.

### Why This Feature Belongs in NRG (Not Nightscout Core)

| Reason | Explanation |
|--------|-------------|
| **Gateway-level enforcement** | NRG can reject requests before they reach Nightscout, protecting unmodified instances |
| **Managed Nightscout compatibility** | BYOD Nightscout instances may not have subjects configured; NRG provides consistent secret management across heterogeneous backends |
| **Lifecycle management** | Nightscout has no concept of deprecated/expired credentials with grace periods; this is operational tooling that fits gateway responsibility |
| **Observability** | Usage tracking and attribution happens at the gateway where all requests pass through |
| **Identity bridging** | NRG secrets can map to Nightscout subjects, leveraging both systems |

### Comparison: NRG Secrets vs Nightscout Subjects

| Feature | NRG Multi-Secret (Proposed) | Nightscout Subjects (Exists) |
|---------|----------------------------|------------------------------|
| Named credentials | Yes | Yes |
| Role/permission mapping | Via `mapped_subject` | Direct role assignment |
| Revocation | Status field with states | Delete subject |
| Expiration | `expires_at` timestamp | No (JWTs expire, but access tokens don't) |
| Usage tracking | `last_used_at`, `usage_count` | No |
| Rotation workflow | Deprecated status + grace period | Manual |
| Where enforced | At gateway (NRG) | At origin (Nightscout) |

### Complementary, Not Competing

This proposal complements rather than replaces Nightscout's native subject system:

| Capability | Owner | Rationale |
|------------|-------|-----------|
| Per-uploader credentials | Both (user choice) | NS subjects for native users; NRG secrets for managed sites |
| Lifecycle management | NRG | Deprecation, expiry, grace periods are operational concerns |
| Usage analytics | NRG | Gateway sees all traffic |
| Role enforcement | Nightscout | Shiro permissions evaluated at origin |
| Unified control plane | NRG | Single dashboard for multi-site operators |

### Recommended Patterns

```
For new managed setups:
├── Simple: Use NRG multi-secrets with escape hatch (no Nightscout changes)
└── Advanced: Use NRG multi-secrets mapped to Nightscout subjects (graduated permissions)

For Nightscout-native users (not using NRG):
└── Continue using Nightscout subjects directly; no NRG involvement

For hybrid deployments:
└── NRG secrets provide lifecycle management; mapped subjects provide permission enforcement
```

For advanced use cases, NRG secrets can be mapped to Nightscout subjects, combining gateway-level lifecycle management with origin-level permission enforcement.

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Secret enumeration** | Rate limit failed attempts, log suspicious patterns |
| **Leaked secret scope** | Mapped subjects limit blast radius vs full API access |
| **Secret storage** | SHA1 hashing (matching Nightscout convention); consider upgrade path to bcrypt |
| **API endpoint security** | Admin-only endpoints, require strong authentication |
| **Audit trail** | All secret operations logged with actor identity |

---

## Future: OAuth Device Flow Credential Type (Phase 6+)

As an **optional alternative** to API secrets, NRG could support OAuth Device Flow credentials for uploaders that implement token refresh:

| Feature | API Secret | Device Flow Token |
|---------|-----------|-------------------|
| Setup complexity | Low (copy/paste) | Medium (QR/code approval) |
| Uploader changes required | None | Significant (token refresh logic) |
| Token refresh | Never | Every 15-60 min |
| Revocation | Immediate | Immediate |
| Audit granularity | Per-secret | Per-token |

**Recommendation:** Implement multi-secret management first (no uploader changes required). Consider Device Flow as optional enhancement when/if uploader apps add OAuth support.

**Note:** Passkeys/WebAuthn are not suitable for machine credentials as they require interactive biometric/PIN verification and are designed for human authentication scenarios.

---

## Phased Implementation Recommendation

| Phase | Scope | Effort | Value Delivered |
|-------|-------|--------|-----------------|
| **Phase 1** | Schema + multi-secret validation | Medium | Multiple secrets, independent revocation |
| **Phase 2** | REST API endpoints | Medium | Programmatic secret management |
| **Phase 3** | Subject mapping integration | Low | Graduated access levels |
| **Phase 4** | Lifecycle (status, expiry) | Medium | Managed rotation workflows |
| **Phase 5** | Observability (attribution, stats) | Medium | Usage analytics, audit trail |
| **Phase 6** | Advanced (rate limits, time-based) | High | Fine-grained control |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Secrets per active site | Avg 3-5 (indicating adoption of per-device credentials) |
| Rotation frequency | Increase from near-zero to quarterly |
| Mapped subject usage | >50% of secrets have subject mapping |
| Deprecated secret warnings | Decreasing over time (operators completing rotations) |

---

## Open Questions (Resolved)

| # | Question | Resolution |
|---|----------|------------|
| 1 | Deprecated secret behavior | Configurable via `NRG_DEPRECATED_SECRET_POLICY` env var |
| 2 | Maximum secrets per site | Configurable via `NRG_MAX_SECRETS_PER_SITE` env var (default: 50) |
| 3 | Secret generation | REST API supports both server-generated and user-provided |
| 4 | OAuth as alternative | Not ergonomically superior for current ecosystem; propose as future Phase 6+ |

---

## Appendix: Example Workflows

### Workflow A: Adding a New Device
```
1. Operator creates secret: POST /secrets { name: "trio-apple-watch" }
2. System returns generated secret value (shown once)
3. Operator enters secret in Trio app settings
4. Trio begins uploading with new secret
5. Dashboard shows "trio-apple-watch: last seen 5 min ago"
```

### Workflow B: Rotating Compromised Secret
```
1. Operator creates replacement: POST /secrets { name: "loop-iphone-v2" }
2. Operator updates Loop app with new secret
3. Verify new secret working (check last_used_at)
4. Deprecate old secret: PATCH /secrets/{old} { status: "deprecated" }
5. System logs warnings when old secret used
6. After grace period, revoke: PATCH /secrets/{old} { status: "revoked" }
```

### Workflow C: Graduated Access for Caregiver
```
1. Ensure Nightscout has "caregiver" subject with careportal permissions
2. Create mapped secret: POST /secrets { 
     name: "grandma-phone", 
     mapped_subject: "caregiver" 
   }
3. Give grandma the secret
4. Her requests get NSJWT with careportal access only
5. She cannot access admin functions or modify treatments beyond her role
```
