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
