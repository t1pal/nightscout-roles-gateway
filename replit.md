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