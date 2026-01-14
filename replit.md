# Nightscout Roles Gateway

A cloud-native RBAC controller for Nightscout. NRG provides a REST API to store and enforce scheduled group policies for registered Nightscout sites.

## Project Overview

This is a Node.js microservice built with Restify that manages sites, groups, and scheduling permission types for Nightscout deployments. It provides authentication and authorization services for load balancers like NGINX.

## Technology Stack

- **Runtime**: Node.js 20
- **Framework**: Restify 11
- **Database**: SQLite3 (development), PostgreSQL (production)
- **ORM**: Knex.js
- **Logging**: Bunyan

## Project Structure

```
├── server.js           # Main entry point
├── env.js              # Environment configuration
├── knexfile.js         # Database configuration
├── lib/
│   ├── bootevent.js    # Boot sequence
│   ├── routes.js       # API route definitions
│   ├── storage.js      # Database connection
│   ├── entities/       # Entity handlers
│   ├── policies/       # Policy handlers
│   └── ...
├── migrations/         # Database migrations
└── test/              # Test files
```

## API Endpoints

- `GET /api/v1/status` - Health check
- `GET /api/v1/status/database` - Database status
- `GET /api/v1/about/server` - Server debug info
- `GET /api/v1/about/database` - Database tables
- Various entity and policy CRUD endpoints

## Running Locally

The server runs on port 5000 by default. Use the "API Server" workflow to start the server.

## Environment Variables

- `PORT` - Server port (default: 5000)
- `BACKEND_ENV` - Environment mode (development/staging/production)
- `KNEX_CONNECT` - PostgreSQL connection string (for staging/production)
- `KRATOS_API` - Kratos API endpoint
- `HYDRA_API` - Hydra API endpoint

## Recent Changes

- **January 2026**: Created comprehensive test specifications in `docs/test-specs/`:
  - `phase1-authorization.md`: Policy resolution, decision logic, access modes A/B/C, BYOD authenticity gate, API secret matching, schedule evaluation
  - `phase2-identity-access.md`: Privy identity resolution, Kratos error handling, group inclusion matching, consent flow
  - `phase3-criteria-validation.md`: BYOD criteria validation pipeline, static analysis, API inspection
  - Includes 100+ test case specifications with IDs for traceability
  - Proposed test file organization structure for unit and integration tests

- **January 2026**: Created `docs/owner-management-api.md` documenting:
  - T1Pal control panel API for managing sites, groups, and policies on behalf of Nightscout owners
  - Database views: `site_acls`, `owner_group_usage`, `site_policy_overview`
  - Complete API reference for owner-scoped endpoints (synopsis, ACLs, groups, memberships, policies)
  - Group creation with initial members, policy assignment with scheduled access
  - Common workflows: create groups, assign to sites, manage members, delete sites

- **January 2026**: Created `docs/privy-identity-access.md` documenting:
  - Identity verification and consent tracking module
  - `site_acls` view and `joined_groups` table data model
  - Invitation flow: owner invites emails → user sees pending → user accepts → access granted
  - Consent model: view access + audit trail for owner
  - API reference for all `/privy/` endpoints
  - Activity logging specification for future implementation
  - Testing considerations and edge cases

- **January 2026**: Updated `docs/token-management.md` with confirmed Nightscout authorization details:
  - Actual `/api/v2/authorization/subjects` response format (fields: `_id`, `name`, `accessToken`, `roles`)
  - Security audit findings: JWT structure (1hr expiry, HMAC-SHA256 signing), default roles, Shiro permission format
  - Access token derivation formula from API_SECRET + subject name
  - Refined deprivilege workflow: setup phase (API secret) → runtime phase (access tokens)
