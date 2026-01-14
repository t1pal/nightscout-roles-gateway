# RFC: OpenID Connect Actor Identity Plugin for Nightscout Core

**Status:** DRAFT  
**Date:** January 2026  
**Authors:** NRG Team  
**Target Audience:** Nightscout Core Maintainers, Community Contributors

---

## Abstract

This proposal outlines a minimal protocol for integrating OpenID Connect (OIDC) and OAuth 2.0 identity management into Nightscout Core, enabling structured actor tracking for all data modifications. The goal is to replace the current freeform `enteredBy` field with cryptographically-verified actor identities, allowing Nightscout to definitively answer: "Was this action performed by Mom, Dad, the school nurse, or an automated agent?"

---

## Table of Contents

1. [Background & Motivation](#background--motivation)
2. [Current State Assessment](#current-state-assessment)
3. [Proposed Architecture](#proposed-architecture)
4. [OAuth2/OIDC Protocol Flow](#oauth2oidc-protocol-flow)
5. [JWT Claims Specification](#jwt-claims-specification)
6. [Actor Lookup Collection Schema](#actor-lookup-collection-schema)
7. [Nightscout Core Plugin Requirements](#nightscout-core-plugin-requirements)
8. [Migration Path for enteredBy](#migration-path-for-enteredby)
9. [Implementation Readiness](#implementation-readiness)
10. [Interview Questions for NS Authors](#interview-questions-for-ns-authors)
11. [Open Questions](#open-questions)
12. [Appendix: Example Flows](#appendix-example-flows)

---

## 1. Background & Motivation

### The Problem with `enteredBy`

Currently, Nightscout tracks who performed an action via the `enteredBy` field, which is:
- **Freeform text** - No validation or structure
- **Self-reported** - Clients set their own value
- **Unauthenticated** - No cryptographic proof of identity
- **Inconsistent** - "Mom", "mom", "Mother", "Parent1" may all be the same person

### Why This Matters

For diabetes management, especially in pediatric care, knowing exactly who performed an action is critical:
- **Care coordination** - Did the school nurse already give insulin?
- **Accountability** - Which parent acknowledged the alert?
- **Audit trails** - Regulatory compliance for clinical settings
- **Automation safety** - Distinguishing human decisions from automated actions

### The Solution

An OIDC-integrated identity system where:
1. Nightscout instances are provisioned as OAuth2 clients
2. Users authenticate through a trusted Identity Provider (IdP)
3. Actions are tagged with verified actor claims in JWTs
4. An actor lookup collection provides human-readable context

---

## 2. Current State Assessment

### Already Implemented in NRG Gateway

| Component | Status | Location |
|-----------|--------|----------|
| OAuth2 client credentials storage | ✅ Implemented | `oauth2_credentials` table |
| Hydra client lifecycle (create/delete) | ✅ Implemented | `lib/clients/index.js` |
| Kratos session resolution | ✅ Implemented | `lib/privy/index.js` |
| NSJWT token exchange | ✅ Implemented | `lib/exchanged.js` |
| Token caching (8hr TTL) | ✅ Implemented | Keyv/Redis |
| ACL-to-identity mapping | ✅ Implemented | `lib/policies/index.js` |
| X-NSJWT header injection | ✅ Implemented | `lib/exchanged.js` |

### What Needs to Be Built

| Component | Owner | Description |
|-----------|-------|-------------|
| OIDC discovery endpoint proxy | NRG Gateway | Forward `.well-known` to Hydra |
| Actor claims in JWT payload | NRG Gateway | Extend NSJWT with actor metadata |
| Nightscout OIDC plugin | NS Core | Handle redirects, extract claims |
| Actor lookup collection | NS Core | MongoDB collection for actor records |
| enteredBy migration | NS Core | Backfill and forward-compatibility |

---

## 3. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Actor Identity Architecture                          │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────┐
                    │         User's Browser/App           │
                    └──────────────────────────────────────┘
                                      │
                                      │ 1. Access NS site
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Nightscout Instance                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  OIDC Plugin (NEW)                                                   │    │
│  │  - Detects unauthenticated request to protected resource            │    │
│  │  - Redirects to IdP authorize URL                                   │    │
│  │  - Exchanges callback code for tokens                               │    │
│  │  - Extracts actor claims from JWT                                   │    │
│  │  - Stores actor reference on data mutations                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      │ Actor claims extracted                │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Existing Collections            │  Actor Lookup Collection (NEW)   │    │
│  │  ┌───────────────┐               │  ┌───────────────────────────┐   │    │
│  │  │ treatments    │               │  │ actors                    │   │    │
│  │  │ - actor_ref ──┼───────────────┼─▶│ - _id (sub claim)        │   │    │
│  │  │ - enteredBy   │               │  │ - display_name           │   │    │
│  │  │   (deprecated)│               │  │ - actor_type             │   │    │
│  │  └───────────────┘               │  │ - delegation_info        │   │    │
│  │  ┌───────────────┐               │  │ - last_seen              │   │    │
│  │  │ entries       │               │  └───────────────────────────┘   │    │
│  │  └───────────────┘               │                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 2. Redirect to IdP
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NRG Gateway (Identity Provider)                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────────┐     │
│  │  OIDC Endpoints │    │  Warden Gateway │    │  Token Service       │     │
│  │                 │    │                 │    │                      │     │
│  │  /.well-known/  │    │  /warden/v1/*   │    │  JWT with actor      │     │
│  │  /oauth2/*      │    │                 │    │  claims              │     │
│  └────────┬────────┘    └─────────────────┘    └──────────────────────┘     │
│           │                                                                  │
│           │ Proxy                                                            │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Load Balancer                                     │    │
│  │                         │                                            │    │
│  │         ┌───────────────┼───────────────┐                           │    │
│  │         ▼               ▼               ▼                           │    │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐                     │    │
│  │  │   Hydra   │   │  Kratos   │   │    NRG    │                     │    │
│  │  │  OAuth2   │   │ Identity  │   │  Warden   │                     │    │
│  │  └───────────┘   └───────────┘   └───────────┘                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. OAuth2/OIDC Protocol Flow

### 4.1 Client Provisioning (One-time Setup)

When a Nightscout site is registered with NRG, OAuth2 credentials are automatically provisioned:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Site      │     │     NRG     │     │    Hydra    │
│   Owner     │     │   Gateway   │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. Register site │                   │
       │ ─────────────────▶│                   │
       │                   │                   │
       │                   │  2. Create client │
       │                   │ ─────────────────▶│
       │                   │                   │
       │                   │  3. client_id +   │
       │                   │     client_secret │
       │                   │ ◀─────────────────│
       │                   │                   │
       │  4. Credentials   │                   │
       │     stored in NS  │                   │
       │     config        │                   │
       │ ◀─────────────────│                   │
```

**NS Instance Configuration:**
```javascript
{
  "oidc": {
    "issuer": "https://nrg.example.com",
    "client_id": "ns-site-abc123",
    "client_secret": "${NS_OIDC_CLIENT_SECRET}",
    "redirect_uri": "https://my-ns-site.example.com/oidc/callback",
    "scopes": ["openid", "profile", "nightscout:actor"]
  }
}
```

### 4.2 User Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │     │ Nightscout  │     │     NRG     │     │   Kratos    │
│  (Parent)   │     │  Instance   │     │   Gateway   │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │  1. GET /careportal                   │                   │
       │ ─────────────────▶│                   │                   │
       │                   │                   │                   │
       │                   │  (No valid session)                   │
       │                   │                   │                   │
       │  2. 302 Redirect  │                   │                   │
       │     to /oauth2/   │                   │                   │
       │     authorize     │                   │                   │
       │ ◀─────────────────│                   │                   │
       │                   │                   │                   │
       │  3. GET /oauth2/authorize?...         │                   │
       │ ─────────────────────────────────────▶│                   │
       │                   │                   │                   │
       │                   │                   │  4. Check session │
       │                   │                   │ ─────────────────▶│
       │                   │                   │                   │
       │                   │                   │  5. No session    │
       │                   │                   │ ◀─────────────────│
       │                   │                   │                   │
       │  6. 302 to Kratos login UI            │                   │
       │ ◀─────────────────────────────────────│                   │
       │                   │                   │                   │
       │  7. User authenticates with Kratos    │                   │
       │ ─────────────────────────────────────────────────────────▶│
       │                   │                   │                   │
       │  8. Session established, redirect back│                   │
       │ ◀─────────────────────────────────────────────────────────│
       │                   │                   │                   │
       │  9. Complete OAuth2 flow, get code    │                   │
       │ ◀─────────────────────────────────────│                   │
       │                   │                   │                   │
       │  10. Callback to NS with code         │                   │
       │ ─────────────────▶│                   │                   │
       │                   │                   │                   │
       │                   │  11. Exchange     │                   │
       │                   │      code for     │                   │
       │                   │      tokens       │                   │
       │                   │ ─────────────────▶│                   │
       │                   │                   │                   │
       │                   │  12. Access token │                   │
       │                   │      + ID token   │                   │
       │                   │      with actor   │                   │
       │                   │      claims       │                   │
       │                   │ ◀─────────────────│                   │
       │                   │                   │                   │
       │  13. Session      │                   │                   │
       │      established  │                   │                   │
       │ ◀─────────────────│                   │                   │
       │                   │                   │                   │
       │  14. User enters treatment            │                   │
       │ ─────────────────▶│                   │                   │
       │                   │                   │                   │
       │                   │  Treatment saved  │                   │
       │                   │  with actor_ref   │                   │
       │                   │  from JWT claims  │                   │
```

---

## 5. JWT Claims Specification

### 5.1 Current NSJWT Claims (Nightscout Native)

```json
{
  "accessToken": "readable-abc123def456",
  "iat": 1705276800,
  "exp": 1705280400
}
```

### 5.2 Proposed Extended Claims

The ID token and access token from NRG should include additional actor claims:

```json
{
  "iss": "https://nrg.example.com",
  "sub": "kratos-identity-uuid-12345",
  "aud": "ns-site-abc123",
  "iat": 1705276800,
  "exp": 1705280400,
  
  "ns_actor": {
    "type": "human",
    "display_name": "Mom",
    "email": "mom@family.example.com",
    "delegation": null
  },
  
  "ns_permissions": {
    "access_token": "careportal-abc123",
    "roles": ["careportal", "readable"]
  }
}
```

### 5.3 Actor Types

| Type | Description | Example |
|------|-------------|---------|
| `human` | Direct user authentication | Parent, patient, healthcare provider |
| `delegate` | Human acting on behalf of another | School nurse with delegated access |
| `automated_agent` | Non-human system/bot | Loop, AAPS, Nightscout Reporter |
| `service` | Backend service-to-service | API integration, data sync |

### 5.4 Delegation Chain

For delegated access (e.g., school nurse acting with parent's permission):

```json
{
  "ns_actor": {
    "type": "delegate",
    "display_name": "School Nurse (Adams Elementary)",
    "email": "nurse@school.example.com",
    "delegation": {
      "delegated_by": "kratos-identity-uuid-parent",
      "delegator_name": "Mom",
      "scope": ["careportal"],
      "expires_at": "2026-06-01T00:00:00Z",
      "policy_id": "school-hours-policy-123"
    }
  }
}
```

### 5.5 Automated Agent Identification

For closed-loop systems and automation:

```json
{
  "ns_actor": {
    "type": "automated_agent",
    "display_name": "Loop (iPhone)",
    "agent_id": "loop-device-uuid",
    "owner_sub": "kratos-identity-uuid-parent",
    "delegation": {
      "delegated_by": "kratos-identity-uuid-parent",
      "delegator_name": "Dad",
      "scope": ["api:treatments:create", "api:entries:read"],
      "never_expires": true
    }
  }
}
```

---

## 6. Actor Lookup Collection Schema

### 6.1 MongoDB Collection: `actors`

A new collection to store and lookup actor information:

```javascript
{
  // Primary identifier - matches JWT `sub` claim
  "_id": "kratos-identity-uuid-12345",
  
  // Human-readable display
  "display_name": "Mom",
  "display_name_short": "M",  // For compact UI
  
  // Actor classification
  "actor_type": "human",  // human | delegate | automated_agent | service
  
  // Contact info (optional, from OIDC claims)
  "email": "mom@family.example.com",
  
  // For automated agents
  "agent_info": {
    "agent_type": "loop",
    "device_name": "iPhone 14",
    "software_version": "3.4.1"
  },
  
  // Delegation metadata (if applicable)
  "delegation": {
    "delegated_by": "kratos-identity-uuid-parent",
    "delegator_display_name": "Dad",
    "delegation_type": "permanent",  // permanent | time_limited | schedule_based
    "created_at": "2025-09-01T00:00:00Z"
  },
  
  // Usage tracking
  "first_seen": "2025-09-01T10:30:00Z",
  "last_seen": "2026-01-14T08:15:00Z",
  "action_count": 1547,
  
  // Audit
  "created_at": "2025-09-01T10:30:00Z",
  "updated_at": "2026-01-14T08:15:00Z"
}
```

### 6.2 Indexes

```javascript
db.actors.createIndex({ "actor_type": 1 });
db.actors.createIndex({ "email": 1 }, { sparse: true });
db.actors.createIndex({ "delegation.delegated_by": 1 }, { sparse: true });
db.actors.createIndex({ "last_seen": -1 });
```

### 6.3 Actor Resolution Flow

When processing a request with actor claims:

```javascript
async function resolveActor(jwtClaims) {
  const actorData = jwtClaims.ns_actor;
  const sub = jwtClaims.sub;
  
  // Upsert actor record
  const actor = await db.actors.findOneAndUpdate(
    { _id: sub },
    {
      $set: {
        display_name: actorData.display_name,
        actor_type: actorData.type,
        email: actorData.email,
        delegation: actorData.delegation,
        updated_at: new Date(),
        last_seen: new Date()
      },
      $setOnInsert: {
        created_at: new Date(),
        first_seen: new Date(),
        action_count: 0
      },
      $inc: { action_count: 1 }
    },
    { upsert: true, returnDocument: 'after' }
  );
  
  return actor;
}
```

---

## 7. Nightscout Core Plugin Requirements

### 7.1 Plugin Configuration

```javascript
// NS config additions
{
  "oidc": {
    "enabled": true,
    "issuer": "https://nrg.example.com",
    "client_id": "${OIDC_CLIENT_ID}",
    "client_secret": "${OIDC_CLIENT_SECRET}",
    "redirect_uri": "https://my-ns.example.com/oidc/callback",
    "scopes": ["openid", "profile", "nightscout:actor"],
    
    // Routes that require authentication
    "protected_paths": [
      "/careportal",
      "/api/v1/treatments",
      "/api/v3/treatments"
    ],
    
    // Routes that allow anonymous access
    "public_paths": [
      "/api/v1/entries.json",
      "/api/v1/status.json"
    ],
    
    // Fallback behavior when no session
    "anonymous_behavior": "redirect",  // redirect | api_secret | deny
    
    // Actor claim extraction
    "actor_claim_path": "ns_actor",
    "permissions_claim_path": "ns_permissions"
  }
}
```

### 7.2 Plugin Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Session Management** | Store and validate OIDC tokens in server session |
| **Auth Redirect** | Redirect unauthenticated users to IdP authorize endpoint |
| **Token Exchange** | Handle `/oidc/callback` and exchange code for tokens |
| **Token Refresh** | Use refresh tokens to maintain session without re-login |
| **Claim Extraction** | Parse `ns_actor` and `ns_permissions` from tokens |
| **Actor Resolution** | Upsert to `actors` collection on each authenticated action |
| **Request Decoration** | Attach `req.actor` for use by other plugins/routes |
| **enteredBy Bridge** | Populate legacy `enteredBy` from actor for compatibility |

### 7.3 Middleware Chain

```javascript
// Proposed middleware order
app.use(oidc.sessionMiddleware());        // Parse/validate session
app.use(oidc.authMiddleware());           // Check auth, redirect if needed  
app.use(oidc.actorMiddleware());          // Extract and resolve actor
app.use(oidc.enteredByBridge());          // Bridge to legacy field
```

### 7.4 Actor-Aware Data Mutations

```javascript
// Before (current)
treatment.enteredBy = req.body.enteredBy || 'unknown';

// After (with plugin)
treatment.actor_ref = req.actor._id;              // Foreign key to actors collection
treatment.actor_snapshot = {                       // Denormalized for query efficiency
  display_name: req.actor.display_name,
  actor_type: req.actor.actor_type
};
treatment.enteredBy = req.actor.display_name;     // Legacy compatibility
```

---

## 8. Migration Path for enteredBy

### 8.1 Phase 1: Parallel Write (Non-breaking)

- Continue writing `enteredBy` as-is
- Additionally write `actor_ref` and `actor_snapshot` for authenticated requests
- For unauthenticated/legacy requests, `actor_ref = null`

### 8.2 Phase 2: Actor Inference (Optional Backfill)

For historical data, optionally infer actors:

```javascript
// Pseudo-code for backfill
db.treatments.find({ actor_ref: null }).forEach(doc => {
  const inferredActor = inferActorFromEnteredBy(doc.enteredBy);
  if (inferredActor) {
    db.treatments.updateOne(
      { _id: doc._id },
      { $set: { 
        actor_ref: inferredActor._id,
        actor_snapshot: { ... },
        actor_inference: 'enteredBy_match'
      }}
    );
  }
});
```

### 8.3 Phase 3: Deprecation Warning

- Log warnings when `enteredBy` is used without actor context
- Encourage clients to authenticate

### 8.4 Phase 4: Optional Enforcement

- Site owners can optionally require authenticated actors for mutations
- Configurable per-site in Mode B/C

---

## 9. Implementation Readiness

### 9.1 NRG Gateway: Ready Today

| Capability | Status | Notes |
|------------|--------|-------|
| OAuth2 client provisioning | ✅ Ready | Via Hydra admin API |
| Client credentials storage | ✅ Ready | `oauth2_credentials` table |
| OIDC discovery proxy | 🔨 Easy | Route to Hydra's `.well-known` |
| Extended JWT claims | 🔨 Easy | Modify token exchange logic |
| Actor claim population | 🔨 Easy | Pull from Kratos identity traits |

### 9.2 Nightscout Core: Plugin Needed

| Capability | Status | Effort |
|------------|--------|--------|
| OIDC client library | 🔨 Needed | Use `openid-client` npm package |
| Session management | 🔨 Needed | Express session with secure cookies |
| Actor collection | 🔨 Needed | New MongoDB collection |
| Middleware chain | 🔨 Needed | 4 middleware functions |
| Config schema | 🔨 Needed | Extend existing config validation |
| UI integration | 🔨 Needed | Show actor in careportal, reports |

### 9.3 Estimated Effort

| Component | Estimated Effort |
|-----------|------------------|
| NRG Gateway extensions | 1-2 days |
| NS Core OIDC plugin (basic) | 3-5 days |
| Actor collection + queries | 1-2 days |
| UI updates (actor display) | 2-3 days |
| Migration tooling | 1-2 days |
| Documentation | 1-2 days |
| **Total** | **10-16 days** |

### 9.4 Implementation Gaps (Honest Assessment)

While the NRG gateway has foundational infrastructure, the following work is still required:

| Gap | Description | Effort |
|-----|-------------|--------|
| **Kratos trait → ns_actor mapping** | Currently tokens contain `accessToken` only; logic needed to populate `ns_actor` claims from Kratos identity traits | Medium |
| **Hydra token customization** | Hydra issues standard OIDC tokens; custom claims require token hook or post-processing | Medium |
| **OIDC discovery routing** | Need to expose Hydra's `.well-known` endpoints through the gateway | Low |
| **Device flow implementation** | For automated agents (Loop, etc.), device authorization grant is not yet implemented | High |

### 9.5 Security Considerations

#### Secret Storage

Client secrets (`client_secret`) require secure handling:

| Concern | Mitigation |
|---------|------------|
| **Storage at rest** | NS instances should store secrets in environment variables, not config files. Use `${OIDC_CLIENT_SECRET}` substitution. |
| **Transmission** | All OIDC flows must use HTTPS. Token endpoint uses `client_secret_post` (secret in body, not URL). |
| **Access control** | Only site administrators should have access to view/modify OIDC configuration. |

#### Credential Rotation

```
Recommended rotation workflow:
1. NRG Gateway creates new client_secret via Hydra Admin API
2. New secret pushed to NS instance config (manual or automated)
3. Grace period where both old and new secrets work
4. Old secret revoked after confirmation
```

**Question for NS Authors**: Does Nightscout have existing patterns for secret rotation (e.g., API_SECRET rotation)?

#### Token Security

| Consideration | Implementation |
|---------------|----------------|
| **Token lifetime** | Access tokens: 1 hour. Refresh tokens: 30 days with rotation. |
| **Token storage (server)** | HTTP-only, secure, SameSite=Strict cookies for session ID. Actual tokens in server-side session store. |
| **Token storage (client)** | Mobile apps should use secure keychain/keystore, not localStorage. |
| **Revocation** | Support for token revocation endpoint; immediate revocation on logout. |

### 9.6 Architectural Clarifications

#### Server vs. Client Authentication

Nightscout is a client-heavy Node.js application. This proposal targets **server-side middleware** for the web interface, plus **API authentication** for REST clients:

| Surface | Authentication Method |
|---------|----------------------|
| **Web UI (browser)** | Server-side OIDC session via cookies. Middleware intercepts protected routes, redirects to IdP. |
| **REST API (devices)** | Bearer token in `Authorization` header. Devices obtain tokens via OAuth2 device flow or refresh token. |
| **Legacy API (existing apps)** | Continue to accept `API-SECRET` header for backward compatibility, but without actor tracking. |

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authentication Surfaces                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Browser ──► Web UI ──► OIDC Session (cookie-based)            │
│                                                                  │
│   Loop/AAPS ──► REST API ──► Bearer Token (device flow)         │
│                                                                  │
│   xDrip ──► REST API ──► API-SECRET (legacy, no actor)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Question for NS Authors**: Is Express session already in use, or does Nightscout rely on stateless JWT-only auth?

---

## 10. Interview Questions for Nightscout Authors

We'd love feedback from the Nightscout core team on the following:

### Identity & Authentication

1. **Federation vs. Sole Provider**: Should this OIDC integration be the *only* identity source, or should it federate with existing auth methods (API secret, token-based)?

2. **Anonymous Access**: How should the plugin handle Mode A (completely public) sites? Should actor tracking be entirely optional?

3. **Device Authentication**: How do closed-loop systems (Loop, AAPS, OpenAPS) currently authenticate? Should they use OAuth2 device flow or client credentials?

### Data Model

4. **enteredBy Deprecation Timeline**: Is there an appetite to eventually deprecate `enteredBy` in favor of structured actors, or should it remain indefinitely for compatibility?

5. **Actor Denormalization**: The proposal suggests storing an `actor_snapshot` on each document for query efficiency. Does this align with Nightscout's data philosophy, or is a pure foreign key preferred?

6. **Historical Data**: Is backfilling historical `enteredBy` values to inferred actors valuable, or is it better to start fresh?

### UI/UX

7. **Actor Display**: Where should actor information be surfaced in the UI? (Careportal entries, reports, hover tooltips?)

8. **Actor Management**: Should there be UI for site owners to manage recognized actors (rename, merge duplicates, revoke)?

### Plugin Architecture

9. **Plugin vs. Core**: Should this be a standalone plugin or integrated into core? What's the current plugin architecture for auth-related functionality?

10. **Existing Auth Hooks**: Are there existing extension points for authentication/authorization that this should use?

### Compatibility

11. **Client Compatibility**: Which NS clients (Android, iOS, web, etc.) would need updates to work with OIDC auth?

12. **API Compatibility**: Should the API continue to accept unauthenticated requests with `enteredBy`, or enforce authentication for mutations?

### Scope & Permissions

13. **OIDC Scopes**: The proposal suggests a `nightscout:actor` scope. Should there be finer-grained scopes (e.g., `nightscout:careportal`, `nightscout:reports`)?

14. **Permission Mapping**: How should OIDC scopes map to Nightscout's existing Shiro-style permissions?

### Operations

15. **Multi-Tenancy**: For hosted Nightscout services (like Nightscout 10BE), is per-site OIDC config needed, or is a shared IdP sufficient?

16. **Credential Rotation**: What's the expected lifecycle for client credentials? Should rotation be automated?

---

## 11. Open Questions

### Technical

- [ ] Should the plugin use Passport.js or a lighter-weight OIDC client?
- [ ] How should token refresh be handled for long-running sessions?
- [ ] Should actor info be cached client-side or fetched per-request?

### Product

- [ ] Is there demand for "actor groups" (e.g., "Healthcare Providers" that includes multiple nurses)?
- [ ] Should actors be able to set their own display names, or are they admin-controlled?
- [ ] How should actor identity work across multiple NS sites for the same user?

### Security

- [ ] Should there be rate limiting per-actor in addition to per-site?
- [ ] How should compromised actor credentials be revoked?
- [ ] Should there be an audit log for actor authentication events?

---

## 12. Appendix: Example Flows

### A. Parent Logs Treatment via Web

1. Parent navigates to `https://kiddo-ns.example.com/careportal`
2. NS detects no session, redirects to `https://nrg.example.com/oauth2/authorize?...`
3. NRG checks Kratos session (or prompts login)
4. NRG issues authorization code, redirects back
5. NS exchanges code for tokens containing:
   ```json
   { "sub": "uuid-mom", "ns_actor": { "type": "human", "display_name": "Mom" } }
   ```
6. Parent enters bolus treatment
7. NS saves treatment with:
   ```json
   { "actor_ref": "uuid-mom", "actor_snapshot": { "display_name": "Mom" }, "enteredBy": "Mom" }
   ```

### B. School Nurse with Delegated Access

1. Nurse navigates to NS site during school hours
2. Auth flow same as above
3. Token contains delegation info:
   ```json
   { 
     "sub": "uuid-nurse", 
     "ns_actor": { 
       "type": "delegate", 
       "display_name": "Nurse Adams", 
       "delegation": { "delegated_by": "uuid-mom", "scope": ["careportal"] }
     } 
   }
   ```
4. Nurse logs carbs
5. Treatment saved with delegation chain visible

### C. Loop Automated Bolus

1. Loop app authenticates via OAuth2 device flow (one-time setup)
2. Loop stores long-lived refresh token
3. On each sync, Loop refreshes access token
4. Token contains:
   ```json
   { 
     "sub": "uuid-loop-device", 
     "ns_actor": { 
       "type": "automated_agent", 
       "display_name": "Loop (iPhone)", 
       "owner_sub": "uuid-dad"
     } 
   }
   ```
5. Automated treatments clearly marked as machine-generated

---

## Feedback & Next Steps

We welcome feedback on this proposal via:
- GitHub issues on this repository
- Discussion in the Nightscout Discord/Gitter
- Direct communication with NRG team

**Proposed next steps:**
1. Gather feedback from NS core maintainers (this document)
2. Prototype NRG gateway extensions
3. Develop minimal NS plugin proof-of-concept
4. Iterate based on community feedback
5. Full implementation and documentation

---

*Document version: 1.0.0-draft*  
*Last updated: January 2026*
