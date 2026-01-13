# Nightscout Roles Gateway - API Documentation

This directory contains the API documentation for the Nightscout Roles Gateway (NRG).

## Files

- `openapi.yaml` - OpenAPI 3.0 specification for the REST API

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
- OAuth client lifecycle
- Group inclusion specifications
- Policy assignment and permissions
- Token management
- Activity logging
- Detailed request/response schemas

## Contributing

When adding new endpoints to `lib/routes.js`, please update the `openapi.yaml` with:

1. Path definition with parameters
2. Request body schema (if applicable)
3. Response schemas
4. Appropriate tags
5. Description of the endpoint's purpose
