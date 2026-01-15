# Nightscout Roles Gateway (NRG)

## Overview

The Nightscout Roles Gateway (NRG) is a cloud-native Role-Based Access Control (RBAC) controller designed for Nightscout Continuous Glucose Monitoring (CGM) systems. Its primary purpose is to provide sophisticated, identity-aware, and scheduled access policies for registered Nightscout sites, bridging a critical gap in Nightscout's native sharing capabilities.

NRG aims to facilitate secure sharing of CGM data with various stakeholders such as family members, caregivers, schools, and healthcare providers, without granting them unrestricted access. It enables fine-grained control over who can view specific Nightscout data and when, evolving the traditional "share link" model into a more secure and manageable system. The project envisions enhancing data privacy and control for Nightscout users while enabling broader, yet secure, data sharing scenarios in healthcare and personal health management.

## User Preferences

I prefer concise and accurate responses. When making changes, prioritize iterative development, and ask for confirmation before implementing major architectural shifts or public API modifications. Ensure all database changes are accompanied by migrations.

## System Architecture

NRG operates as a REST API server, mediating access between users and Nightscout instances. It implements three distinct access modes:

-   **Mode A (Anonymous)**: Allows public viewing via a link, similar to traditional Nightscout.
-   **Mode B (Identity-Mapped)**: Requires user login with access controlled by group-based policies and time-based scheduling.
-   **Mode C (Legacy Escape)**: Provides an API secret bypass for uploaders and legacy applications.

The system uses a layered architecture, with `server.js` as the entry point, `lib/routes.js` for API definitions, and `lib/storage.js` for database interactions. Policy evaluation is handled by `lib/policies/`, identity and consent by `lib/privy/`, and site registration by `lib/registrations/`.

### UI/UX Decisions

The project primarily focuses on backend API development. UI/UX considerations for the control panel (T1Pal) and identity flows are managed through integration with ORY Kratos and Hydra, leveraging their established user interfaces and design patterns for authentication and consent.

### Technical Implementations

-   **Runtime**: Node.js 20
-   **Framework**: Restify 11
-   **Database**: SQLite3 for development, PostgreSQL for production.
-   **Query Builder**: Knex.js
-   **Identity & Access Management**: ORY Kratos (identity management) and ORY Hydra (OAuth2 and OpenID Connect server).
-   **Logging**: Bunyan

### Feature Specifications

-   **Warden (Policy Enforcement)**: `GET /warden/decision` endpoint for real-time access decisions, typically used by proxies like NGINX.
-   **Owner Management API**: Endpoints for registering Nightscout sites, managing user groups, and creating connection policies (`/api/v1/owner/*`).
-   **Privy (Identity API)**: Endpoints for handling user invitations and consent (`/api/v1/privy/*`).

### Use Cases Documentation

The project maintains a comprehensive use case matrix at `docs/USE-CASES-MATRIX.md` covering:
-   **Care Lifecycle Stages**: Pediatric, teen, adult independent, adult with variable support, elder care
-   **Context Environments**: Home, school, workplace, healthcare clinical, social events, emergency
-   **Actor Relationships**: Self, family, professional caregivers, healthcare providers, automated agents, transient helpers
-   **Temporal Patterns**: Always-on, scheduled recurring, event-based, on-demand with boundaries, emergency override

This matrix maps use case scenarios to NRG components and tracks implementation status.

### System Design Choices

-   **Database Schema**: Core tables include `registered_sites`, `group_definitions`, `connection_policies`, and `scheduled_policies`.
-   **Views**: Key database views like `unified_active_site_policies` provide flattened and pre-computed access control lists.
-   **Design Patterns**:
    -   **Updatable Views**: Simplify complex multi-table operations through `INSTEAD OF` triggers.
    -   **Activity Pattern**: All changes, especially permission assignments, are recorded in "activity tables" (`permission_assignment_activities`), providing an auditable log. Triggers interpret these activities to apply changes.
    -   **Trigger-Based Security**: Critical security checks, such as secret hashing and blocklist enforcement, are implemented as database triggers to prevent bypasses.

## External Dependencies

-   **ORY Kratos**: Used for identity management and user authentication. The Kratos API endpoint is configured via `KRATOS_API`.
-   **ORY Hydra**: Functions as an OAuth2 and OpenID Connect server for managing consent and access tokens. The Hydra API endpoint is configured via `HYDRA_API`.
-   **PostgreSQL**: The preferred production database, configured via the `KNEX_CONNECT` environment variable.
-   **SQLite3**: Used for development environments.
-   **Knex.js**: A SQL query builder for Node.js, abstracting database interactions.

## Test Coverage

### Running Tests

```bash
npm test              # Default: skips Hydra/Kratos-dependent tests
npm run test:all      # Runs all tests (requires Hydra/Kratos)
```

### Test Summary (January 2026)

| Test File | Tests | Status |
|-----------|-------|--------|
| `test/integration/owner_api.test.js` | 25 | All passing |
| `test/integration/portal_identity_access.test.js` | 9 | 8 passing, 1 pending |
| `test/integration/api_secret_middleware.test.js` | 8 | All passing |
| `test/integration/nsjwt_token_exchange.test.js` | 6 | All passing |
| `test/integration/warden_flow.test.js` | 9 | All pending (Kratos) |
| `test/integration/site_registration.test.js` | 3 | 1 passing, 2 skipped (Hydra) |
| `test/integration/privy_consent_flow.test.js` | 13 | All passing |
| `test/integration/owner_site_deletion.test.js` | 7 | All passing |
| `test/integration/privy_edge_cases.test.js` | 9 | All passing |
| `test/views/*` | 34 | All passing |
| `test/triggers/*` | 29 | All passing |
| `test/unit/*` | 77 | All passing |

**Total**: 218 passing, 16 pending (Hydra/Kratos skipped, TRG-CC-01/02 skipped), 0 failing

### Test Infrastructure

Tests use centralized migration management via Mocha root hooks (`.mocharc.json` + `test/setup/hooks.js`). This ensures:
- Migrations run once before all tests
- Migration locks are cleared before running
- Database connections are properly cleaned up after tests

### Owner API Endpoints Tested

The following `/api/v1/owner/*` endpoints have integration test coverage:

- **Groups**: CRUD operations, list overview, details, attributes
- **Group Inclusions**: Add/search/delete inclusion specs
- **Synopsis**: Owner overview, site-specific synopsis
- **ACLs**: Owner ACLs, site ACLs
- **Permissions**: Policy assignment and overview

### Known Blockers

1. **Hydra-dependent tests**: Site registration workflow requires ORY Hydra for OAuth client creation
2. **Kratos-dependent tests**: Warden active endpoint requires ORY Kratos for session validation
3. **Async timing**: Restify doesn't await Promise-returning handlers (documented in quirks)

### Documented Quirks

See `test/quirks/README.md` for detailed documentation of observed behaviors:

- **OWN-INC-Q01**: Email normalization not applied (adjust function issue)
- **OWN-SYN-Q01**: Sites without policies absent from synopsis view
- **OWN-ACL-Q01**: Unassigned groups query returns empty for truly unassigned groups
- **NSJWT-Q01**: Async timing in token exchange handler
- **E2E-Q02**: matches_api_secret async timing
- **TRG-CC-Q01**: remove_joined_groups_via_policy trigger behavior in test environment (trigger works in direct SQL verification)
- **OWN-SITE-DEL-Q01**: Site deletion does NOT cascade to connection_policies
- **OWN-SITE-DEL-Q02**: Site deletion does NOT cascade to joined_groups
- **OWN-SITE-DEL-Q03**: Site deletion does NOT cascade to oauth2_credentials
- **OWN-SITE-DEL-Q04**: Group deletion does NOT cascade to connection_policies