# Nightscout Criteria System

The criteria system validates Nightscout instances during BYOD (Bring Your Own Nightscout) registration. It serves as a security gate to prevent the system from being misused as an open proxy.

## Purpose

When NRG allows users to register their own Nightscout instances ("Bring Your Own Nightscout"), it creates a potential security risk: the system could be abused as an open proxy to any URL. The criteria system mitigates this by:

1. Verifying the upstream URL points to an actual Nightscout instance
2. Confirming the user has legitimate access (via API secret)
3. Checking the instance is healthy and properly configured

Only instances that pass mandatory criteria can be registered and proxied through the gateway.

## Inspection Pipeline

The validation runs through three sequential inspection stages:

### Stage 1: Static Analysis

Validates inputs without making network requests:

| Check | Criteria | Mandatory |
|-------|----------|-----------|
| API Secret Length | Must be at least 12 characters | Yes |
| URL Syntax | Must have a valid hostname | Yes |

### Stage 2: API Liveness Check

Tests basic reachability of the Nightscout instance:

| Check | Criteria | Mandatory |
|-------|----------|-----------|
| Status Endpoint | `GET /api/v1/status.json` must return HTTP 200 | Yes |

### Stage 3: Authenticated API Check

Verifies the provided API secret is valid:

| Check | Criteria | Mandatory |
|-------|----------|-----------|
| Authenticated Status | `GET /api/v1/status.json` with hashed API-SECRET header must return HTTP 200 | Yes |

## Criteria Structure

Each check produces a criterium object with the following fields:

```javascript
{
  group: "Nightscout API Secret",  // Category of the check
  property: "api secret",           // What is being checked
  criteria: "must be minimum length", // The requirement
  outcome: "api secret length is 16", // Actual result description
  passing: true,                    // Did it pass?
  mandatory: true                   // Does failure block registration?
}
```

## Pass/Fail Logic

The overall audit result is determined by:

- **Acceptable**: `true` if zero mandatory criteria failed (`rejects == 0`)
- **Status**: `"OK"` if acceptable, `"not ok"` otherwise
- **Synopsis**: Human-readable summary including warning count if applicable

A site can only be registered if the audit is `acceptable`. Non-mandatory failures generate warnings but don't block registration.

## Synopsis Response

The `describe()` function produces a summary:

```javascript
{
  txt: "Nightscout is OK.",  // or includes warning/rejection details
  status: "OK",              // or "not ok"
  acceptable: true,          // can proceed with registration
  details: {
    passing: 4,    // number of passing checks
    warning: 0,    // non-mandatory failures
    rejects: 0     // mandatory failures (blocks registration)
  }
}
```

## Integration Points

The criteria system integrates with the registration workflow:

1. **Pre-registration audit**: `POST /api/v1/nightscout/audit` validates before registration
2. **Registration workflow**: Uses `triage` handler to run criteria during site registration
3. **Audit persistence**: Results are stored in `nightscout_inspection_results` and `nightscout_inspection_details` tables

## Database Tables

| Table | Purpose |
|-------|---------|
| `nightscout_inspection_results` | Stores audit summaries (status, synopsis, acceptable) |
| `nightscout_inspection_details` | Stores individual criteria outcomes for each audit |
| `nightscout_secrets` | Stores hashed API secrets for registered sites |

## Future Enhancements

The codebase includes planning notes (in code comments) for additional criteria that are **not yet implemented**:

### Planned Checks (NOT IMPLEMENTED - from code comments)

These checks are documented in the source code as potential future enhancements:

| Harness | Property | Criteria | Notes |
|---------|----------|----------|-------|
| http | `/api/v1/entries.json` | reachable, has_data | Optional data checks |
| http | `/api/v1/treatments.json` | reachable, has_data | Optional data checks |
| http | `/api/v1/devicestatus.json` | reachable, has_data | Optional data checks |
| http | `/api/v1/profiles.json` | reachable, has_data | Optional data checks |
| security | `/api/v3/version` | handshake | API v3 verification |
| security | `/api/v1/experiments/test` | handshake | Experimental endpoint |
| security | `/api/v1/verifyauth` | handshake | Auth verification |
| subjects | `/api/v2/authorization/subjects` | list, with-vetted-list | Authorization system |
| roles | `/api/v2/authorization/roles` | with-vetted-list | Authorization system |
| JWTS | `/api/v2/authorization/request/token` | issue | Token issuance |

These would provide deeper validation of Nightscout's authorization subsystem and data availability when implemented.

## Code Location

- `lib/criteria/core.js` - Inspection pipeline and criteria logic
- `lib/criteria/index.js` - Handler integration and persistence
