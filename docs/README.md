# Nightscout Roles Gateway - API Documentation

This directory contains the API documentation for the Nightscout Roles Gateway (NRG).

## Files

- `openapi.yaml` - OpenAPI 3.0 specification for the REST API
- `access-modes.md` - Documentation of the three orthogonal access conditions
- `criteria-system.md` - BYOD Nightscout validation pipeline and security
- `oauth-client-lifecycle.md` - OAuth client management, invitation/RSVP flow, and Hydra integration
- `policies-and-permissions.md` - Groups, connection policies, scheduled access, and ACL resolution
- `privy-identity-access.md` - Identity verification, consent tracking, and group membership
- `site-registration-workflow.md` - Site registration lifecycle, endpoints, and auto-created resources
- `token-management.md` - NSJWT token exchange, authorization discovery, and deprivilege workflows
- `warden-gateway.md` - NGINX authorization integration, handler chain, and upstream resolution

## Architecture

NRG operates as part of a multi-component system designed to provide flexible, secure access to Nightscout instances:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Control Panel  │     │   WWW Viewer    │     │ Legacy Devices  │
│    (T1Pal)      │     │   Frontend      │     │   (Uploaders)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ REST API              │ Vanity URL            │ API Secret
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        NGINX Load Balancer                       │
│                    (auth_request → Warden API)                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Nightscout Roles Gateway (NRG)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Warden   │  │ Policies │  │ Criteria │  │ Registrations    │ │
│  │ Gateway  │  │ Engine   │  │ Auditor  │  │ Workflow         │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Registered Nightscout Instances                │
│                     (BYOD or Managed)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Components

- **Control Panel**: Administrative interface for site registration, policy configuration, and group management. Uses the REST API to configure access rules.

- **WWW Viewer**: Web frontend providing authenticated viewing of Nightscout instances at vanity URLs.

- **NGINX Load Balancer**: Routes requests to registered Nightscout instances. Uses `auth_request` directives to call NRG's Warden API for authorization decisions.

- **NRG Core**: This service, providing:
  - **Warden Gateway**: NGINX-facing endpoints for authorization decisions
  - **Policies Engine**: Evaluates access based on identity, groups, and schedules
  - **Criteria Auditor**: Validates BYOD Nightscout instances (see `criteria-system.md`)
  - **Registrations Workflow**: Manages site registration lifecycle

### Access Modes

NRG supports three orthogonal access conditions. See `access-modes.md` for full details:

| Mode | Description |
|------|-------------|
| **Anonymous** | Public access at vanity URL |
| **Identity-Mapped** | Login required with consent logging |
| **Legacy Escape Hatch** | API secret bypasses login for uploaders |

### BYOD Security

When users bring their own Nightscout instances, NRG validates them through a criteria-based audit system to prevent misuse as an open proxy. See `criteria-system.md` for the validation pipeline.

## Overview

The NRG API is organized into the following endpoint categories:

| Tag | Description |
|-----|-------------|
| **Status** | Health check and status endpoints |
| **About** | Server and database introspection |
| **Entities** | Generic entity CRUD operations |
| **Objects** | Object management by kind (Site, Group, etc.) |
| **Workflows** | Site registration workflows |
| **Owner** | Owner administration endpoints |
| **Groups** | Group management and membership |
| **Clients** | OAuth client management |
| **Privy** | User identity and privacy endpoints |
| **Warden** | Authentication gateway for load balancers |
| **Nightscout** | Nightscout-specific audit and criteria |

## Viewing the Documentation

### Option 1: Swagger UI (Online)

1. Go to [Swagger Editor](https://editor.swagger.io/)
2. Import the `openapi.yaml` file

### Option 2: Local Swagger UI

```bash
npm install -g swagger-ui-watcher
swagger-ui-watcher docs/openapi.yaml
```

### Option 3: Redoc

```bash
npx @redocly/cli preview-docs docs/openapi.yaml
```

## API Base URL

- Development: `http://localhost:5000`
- The API version prefix is `/api/v1/` for most endpoints
- Warden endpoints use `/warden/v1/` prefix

## Authentication

The API uses Nightscout's `API_SECRET` for site authentication. Pass it via the `api-secret` header when required.

## Documentation Status

This OpenAPI specification is a skeleton that covers the main endpoint categories. 

### Documented Endpoints

- Status and health checks
- Database introspection
- Basic object CRUD
- Site registration workflow
- Owner synopsis
- Group management
- Nightscout audit
- Warden gateway

### TODO: Additional Endpoints to Document

- Complete entity filtering and search
- Activity logging
- Detailed request/response schemas

### Recently Documented

- Group inclusion specifications → See `policies-and-permissions.md`
- Policy assignment and permissions → See `policies-and-permissions.md`
- Scheduled policies → See `policies-and-permissions.md`
- Site registration workflow → See `site-registration-workflow.md`
- OAuth client lifecycle → See `oauth-client-lifecycle.md`
- Token management and NSJWT exchange → See `token-management.md`

## Contributing

When adding new endpoints to `lib/routes.js`, please update the `openapi.yaml` with:

1. Path definition with parameters
2. Request body schema (if applicable)
3. Response schemas
4. Appropriate tags
5. Description of the endpoint's purpose
