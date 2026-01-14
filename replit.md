# Nightscout Roles Gateway (NRG)

A cloud-native RBAC controller for Nightscout CGM systems. NRG provides a REST API to store and enforce scheduled, identity-aware access policies for registered Nightscout sites.

## What This Project Does

NRG sits between users and Nightscout instances, providing sophisticated access control that Nightscout cannot natively provide. It solves the problem of sharing CGM data with families, caregivers, schools, and healthcare providers without giving everyone full access.

**Three Access Modes**:
- **Mode A (Anonymous)**: Anyone with the link can view (traditional Nightscout behavior)
- **Mode B (Identity-Mapped)**: Visitors must log in, with group-based policies and scheduling
- **Mode C (Legacy Escape)**: API secret bypasses login (for uploaders and legacy apps)

## Quick Start

```bash
# Install dependencies
npm install

# Run migrations (creates SQLite database in development)
npx knex migrate:latest

# Start the server
npm start
```

The server runs on port 5000. Use the "API Server" workflow in Replit.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20 |
| Framework | Restify 11 |
| Database | SQLite3 (dev), PostgreSQL (prod) |
| Query Builder | Knex.js |
| Identity | ORY Kratos/Hydra |
| Logging | Bunyan |

## Project Structure

```
├── server.js               # Entry point
├── env.js                  # Environment configuration
├── knexfile.js             # Database configuration
├── lib/
│   ├── bootevent.js        # Boot sequence orchestration
│   ├── routes.js           # API route definitions
│   ├── storage.js          # Database connection
│   ├── entities/           # Entity CRUD handlers
│   ├── policies/           # Policy evaluation (decision logic)
│   ├── owner/              # Owner management API
│   ├── privy/              # Identity and consent handling
│   ├── registrations/      # Site registration workflow
│   └── criteria/           # BYOD validation pipeline
├── migrations/             # Database migrations (32 files)
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md     # Theory of operations, why tables exist
│   ├── MIGRATIONS-NARRATIVE.md  # Schema evolution story
│   ├── MAINTENANCE-GUIDE.md     # Debugging and troubleshooting
│   ├── ROADMAP.md          # Planned features and tech debt
│   ├── access-modes.md     # Detailed Mode A/B/C documentation
│   ├── policies-and-permissions.md  # Groups, policies, schedules
│   ├── criteria-system.md  # BYOD validation pipeline
│   ├── proposals/          # RFC proposals
│   │   └── oidc-actor-identity-proposal.md  # OIDC plugin for NS Core
│   └── ...
└── test/                   # Test files
```

## Core API Endpoints

### Status & Health
- `GET /api/v1/status` - Health check
- `GET /api/v1/status/database` - Database connectivity

### Warden (Policy Enforcement)
- `GET /warden/decision` - Access decision for a request
- Used by NGINX `auth_request` directive

### Owner Management
- `GET /api/v1/owner/synopsis` - Owner's sites summary
- `POST /api/v1/owner/sites` - Register a site
- `GET /api/v1/owner/groups` - List owner's groups
- `POST /api/v1/owner/policies` - Create connection policy

### Privy (Identity)
- `GET /api/v1/privy/pending` - User's pending invitations
- `POST /api/v1/privy/accept` - Accept invitation (consent)

## Database Architecture

### Core Tables
| Table | Purpose |
|-------|---------|
| `registered_sites` | Nightscout instances under management |
| `group_definitions` | Collections of identities (roles) |
| `group_inclusion_specs` | Rules for group membership (email matching) |
| `connection_policies` | Links groups to sites with permissions |
| `scheduled_policies` | Time-based policy modifications |
| `joined_groups` | Consent records (user accepted invitation) |

### Key Views
| View | Purpose |
|------|---------|
| `site_acls` | Joined sites, policies, groups, specs |
| `site_policy_overview` | Flattened policy assignments |
| `unified_active_site_policies` | Final decision view with schedule override |

### Security Tables
| Table | Purpose |
|-------|---------|
| `nightscout_secrets` | Hashed API secrets for Mode C |
| `nightscout_authenticity_records` | BYOD validation certificates |
| `reserved_expected_names` | Blocked vanity names |
| `reserved_upstream_origin` | Blocked upstream URLs |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Server port | 5000 |
| `BACKEND_ENV` | Environment mode | development |
| `KNEX_CONNECT` | PostgreSQL connection string | (SQLite in dev) |
| `KRATOS_API` | ORY Kratos API endpoint | - |
| `HYDRA_API` | ORY Hydra API endpoint | - |

## Documentation Index

For detailed understanding, read the docs in this order:

1. **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Start here. Theory of operations, why each component exists, data flow diagrams.

2. **[MIGRATIONS-NARRATIVE.md](docs/MIGRATIONS-NARRATIVE.md)** - The story of how the schema evolved. Lessons learned, product discovery insights.

3. **[access-modes.md](docs/access-modes.md)** - Deep dive into the three access modes.

4. **[policies-and-permissions.md](docs/policies-and-permissions.md)** - Groups, connection policies, schedules, and ACL resolution.

5. **[criteria-system.md](docs/criteria-system.md)** - BYOD validation pipeline.

6. **[MAINTENANCE-GUIDE.md](docs/MAINTENANCE-GUIDE.md)** - Debugging scenarios, trigger dependencies, common issues.

7. **[ROADMAP.md](docs/ROADMAP.md)** - Planned features, enhancement opportunities, technical debt.

### API Documentation
- **[owner-management-api.md](docs/owner-management-api.md)** - T1Pal control panel API
- **[privy-identity-access.md](docs/privy-identity-access.md)** - Identity and consent API
- **[token-management.md](docs/token-management.md)** - Nightscout JWT integration

### Test Specifications
- **[test-specs/](docs/test-specs/)** - 100+ test case specifications for authorization, identity, and validation

## Key Design Patterns

### Updatable Views
Views with `INSTEAD OF` triggers present a simplified API while handling complex multi-table operations internally.

### Activity Pattern
Changes go through activity tables (like `permission_assignment_activities`). Triggers interpret activities and apply them, providing audit trail and validation.

### Trigger-Based Security
Critical security checks (secret hashing, blocklist enforcement) happen in database triggers where they can't be bypassed.

## Recent Changes

**January 2026**:
- Created comprehensive architecture documentation (`docs/ARCHITECTURE.md`)
- Added migration narrative explaining schema evolution (`docs/MIGRATIONS-NARRATIVE.md`)
- Created maintenance guide for debugging (`docs/MAINTENANCE-GUIDE.md`)
- Added roadmap documenting planned features and tech debt (`docs/ROADMAP.md`)
- Added 100+ test case specifications across three phases
- Documented owner management API, identity access, and token management

## Development Notes

### Running Migrations
```bash
npx knex migrate:latest      # Apply all migrations
npx knex migrate:rollback    # Roll back last batch
```

### Viewing Database
```bash
# In development (SQLite)
sqlite3 ./nrg.sqlite3

# Check a table
.schema registered_sites
SELECT * FROM registered_sites;
```

### Common Debugging
```sql
-- Check if site is enabled and configured
SELECT id, expected_name, is_enabled, require_identities
FROM registered_sites WHERE expected_name = 'mysite';

-- Check active policies for a site
SELECT * FROM unified_active_site_policies
WHERE expected_name = 'mysite';
```

See [MAINTENANCE-GUIDE.md](docs/MAINTENANCE-GUIDE.md) for comprehensive debugging scenarios.
