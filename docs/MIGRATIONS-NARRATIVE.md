# Migration Narrative: How NRG's Schema Evolved

This document chronicles the evolution of the NRG database schema through its migrations. It tells the story of product discovery, revealing what problems were encountered and how the design responded.

## Overview

The migrations span from April 30, 2022 to June 12, 2022 - approximately 6 weeks of intensive development. Reading them chronologically reveals a pattern: **core tables first, then views for querying, then triggers for automation, then security hardening**.

## Phase 1: Foundation (April 30 - May 3)

### The Core Domain Model

**Migration 20220430192240**: `00-initial_functions.js`

Sets up utility functions like `on_update_timestamp()` for automatic `updated_at` management. This is infrastructure that all other tables depend on.

**Migration 20220430192247**: `initial_migration.js`

Creates `registered_sites` - the heart of the system. Key observations:

- `expected_name` is unique and indexed - vanity URLs must be globally unique
- `upstream_origin` is nullable - sites can be registered before knowing where they point
- `api_secret` stored directly initially - a security decision revisited later
- `require_identities` and `exempt_matching_api_secret` - the Mode B/C toggles were present from day one
- Commented-out `hashed_api_secret` - the design anticipated hashing but didn't implement it yet

**Lesson learned**: The core access mode architecture was well-understood from the start. The three modes (A/B/C) were foundational, not added later.

**Migration 20220430221943**: `init_group_definitions.js`

Groups as a first-class concept. Notable:

- `deny_access` boolean - negative permissions were planned from the start
- `owner_ref` - groups are owned, enabling multi-tenant operation
- Commented-out `allow_discovery` - there was thought about group discovery that was shelved

**Migration 20220430223214**: `init_group_inclusion_specs.js`

The membership rules for groups. Key insight:

- `identity_type` is flexible - supports email, but designed for extensibility (FB groups, organization claims)
- `identity_spec` is text - can hold any identifier format

**Lesson learned**: The system was designed for identity provider agnosticism. Email is the implementation, but the schema could support other identity sources.

**Migration 20220430225440**: `init_connection_policies.js`

Links groups to sites with permissions. Important patterns:

- `sort` column with auto-initialization trigger - policy order matters
- `policy_type` and `policy_spec` separation - type is "how" (default, nsjwt), spec is "what" (allow, deny)

**Migration 20220430225902**: `init_scheduled_policies.js`

Time-based access was a day-one feature, not an afterthought:

- `schedule_segments` as comma-separated text - a design that gets revisited
- `fill_pattern` matching segments - the time-slicing algorithm
- `schedule_type` defaulting to 'week' - monthly/daily schedules were anticipated but not implemented

**Migration 20220503180413**: `inital_nightscout_secrets.js`

Security hardening begins:

- Creates `nightscout_secrets` table for hashed secrets
- Implements `sync_hashed_api_secret()` trigger on `registered_sites`
- The trigger:
  1. Copies the secret to `nightscout_secrets` with SHA-1 hash
  2. Attempts to clear plaintext from the NEW record: `NEW.api_secret = '';`
  3. Note: The BEFORE trigger modifies NEW, but whether this persists depends on the return value handling
- Uses SHA-1 hashing via PostgreSQL's `digest()` function
- The `nightscout_secrets` table itself stores both `api_secret` (for potential re-hashing) and `hashed_api_secret`

**Lesson learned**: The original design stored API secrets in plaintext. Within 3 days, this was remediated with a separate secrets table and automatic hashing. The secret synchronization architecture shows an evolving understanding of security requirements.

## Phase 2: Query Optimization (May 7-9)

### Views for Common Queries

**Migration 20220507172333**: `cascade_group_policy_deletes.js`

Adds foreign key cascade behavior. Deleting a group should delete its policies.

**Migration 20220507182426**: `site_groups_view.js`

First view creation. The system recognized that joining sites→policies→groups was a common pattern that deserved optimization.

**Migration 20220507200950**: `site_acl_view.js`

The `site_acls` view joins everything together:
- Sites → Policies → Groups → Inclusion Specs → Schedules

This is the "ACL denormalized" view that makes authorization checks efficient.

**Migration 20220507212220**: `group_usage_view.js`

`owner_group_usage` - shows owners which groups they have and where they're used.

**Migration 20220507231106**: `site_registration_synopsis.js`

`site_registration_synopsis` - a simplified view for displaying site lists.

**Migration 20220508012959**: `site_registration_initializations.js`

Creates an upsertable view with `INSTEAD OF INSERT` trigger. This is a significant pattern:

- The view looks like a table to the application
- Inserting into it triggers complex multi-table operations
- Simplifies the API layer significantly

**Migration 20220508223845**: `add_sort_order_to_connection_policy.js`

Improves the sort order management with better triggers.

**Migration 20220509214321**: `fix_owner_group_usage.js`

Bug fix for the owner group usage view.

**Lesson learned**: The view-with-trigger pattern (updatable views) became a key architectural choice. It lets the API think in terms of high-level objects while the database handles the relational complexity.

## Phase 3: Policy Management (May 10-12)

### Sophisticated Policy Editing

**Migration 20220510151658**: `add_create_site_policy_view.js`

Creates `site_policy_details` view with elaborate triggers:

- `create_site_policy_details()` - handles INSERT
- `update_site_policy_details()` - handles UPDATE
- Manages both policies and their schedules through one view

This is ~200 lines of PL/pgSQL - the complexity reflects the desire to present a simple API to clients while handling many edge cases.

**Migration 20220511023502**: `add_create_site_policy_overview.js`

`site_policy_overview` - an even more complete flattened view with insertion triggers.

**Migration 20220512161211**: `add_site_permission_assignment_activities.js`

Introduces the activity log pattern:

- `permission_assignment_activities` table stores audit trail
- Activities have operations: assign, reassign, update, delete
- `before_insert_permission_assignment_activity()` validates and determines operation type
- `after_insert_permission_assignment_activity()` actually performs the operation

**Lesson learned**: The Command Pattern emerged. Instead of direct CRUD on policy tables, changes go through an activity table. The database triggers interpret activities and apply them. This provides:
1. Audit trail
2. Validation at the database level
3. Complex multi-table updates from simple inserts

## Phase 4: Schedule Processing (May 16-17)

### Making Schedules Work

**Migration 20220516185528**: `create_schedule_arrays.js`

The `site_policy_schedules` view is the schedule evaluation engine:

```sql
-- Parse comma-separated segments into rows
UNNEST(string_to_array(schedule_segments, ',')) AS slice

-- Number the segments
row_number() OVER (...) AS num

-- Calculate end times using lead()
lead(slice, 1) OVER (...) as end

-- Match segments to fill patterns
fill_num = (slices.num % (fill_idx.total + 1))
```

**Lesson learned**: The modulo math for fill pattern assignment has a known issue - it can skip segments when segment count doesn't match pattern count. The documentation notes this and suggests matching counts explicitly.

**Migration 20220516233454**: `add_filter_only_active_schedule_segments.js`

`site_policy_schedules_active` filters to segments containing "now":

```sql
WHERE seconds_since_anchor >= start AND seconds_since_anchor < end
```

Uses `date_trunc('week', ...)` with adjustments for PostgreSQL's Monday-based weeks vs Sunday-based schedule offsets.

**Migration 20220517164328**: `active_acls.js`

The final decision view: `unified_active_site_policies`

```sql
COALESCE(sch.spec, acl.policy_spec) AS policy_spec
```

If a schedule is active and has a spec, use it. Otherwise, use the base policy spec. This single `COALESCE` is where schedule overrides happen.

## Phase 5: Consent and Identity (May 21-29)

### User Acceptance Flow

**Migration 20220521011239**: `joined_groups.js`

The consent materialization table:

- `subject` - the user who consented
- `expected_name`, `group_id`, `policy_id` - what they consented to
- Records created when users accept invitations

**Migration 20220529163520**: `add_oauth2_credentials.js`

OAuth2 credential storage. The identity integration with Kratos/Hydra needed client credentials stored.

**Lesson learned**: The consent model was added mid-development. Initial designs may have assumed simpler identity flows. The `joined_groups` table represents the realization that identity-mapped access needs explicit consent tracking.

## Phase 6: BYOD Security (June 5-10)

### Validating External Nightscout Instances

**Migration 20220605232430**: `nightscout_inspection_details.js`

Stores individual criteria outcomes from BYOD validation.

**Migration 20220605232433**: `nightscout_inspection_results.js`

Stores overall audit results: status, synopsis, acceptable.

**Lesson learned**: BYOD (Bring Your Own Nightscout) required validation. Without it, NRG could be abused as an open proxy. The criteria system emerged from security requirements.

**Migration 20220606224409**: `enforce_group_exit_functions.js`

Cleanup triggers for group operations.

**Migration 20220609213315**: `reserved_expected_names.js`

Blocklists for vanity names - prevent registration of `admin`, `api`, etc.

**Migration 20220609213323**: `reserved_upstream_origins.js`

Blocklists for upstream URLs - prevent proxying to internal services, localhost, etc.

Uses trigger-based enforcement:
```sql
IF EXISTS(SELECT * FROM reserved_upstream_origin WHERE NEW.upstream_origin SIMILAR TO reserved_upstream_origin.reserved_upstream) THEN
  RAISE EXCEPTION 'cannot be a reserved upstream_origin: %', NEW.upstream_origin;
END IF;
```

**Migration 20220609233959**: `disallowed_site_info.js`

Additional blocklist management.

**Migration 20220610171038**: `nightscout_authenticity_record.js`

The certificate of authenticity:

- Created by trigger when inspection results are inserted
- Invalidated when `upstream_origin` changes
- `acceptable` boolean gates access when `strictly_nightscout` mode is on

**Lesson learned**: Security was progressively hardened. Initial versions trusted user input more. Production requirements drove blocklists, validation, and authenticity tracking.

## Phase 7: Cleanup & Lifecycle (June 12)

### Safe Deletion

**Migration 20220612194318**: `cleanup_delete_sites.js`

Cascade delete management:

- `delete_site_resources()` - triggered when deleting from `site_registration_initializations` view
- Removes groups, policies, inspection records
- `remove_joined_groups_via_policy()` - cleans up consent records when policies are deleted

**Lesson learned**: Complex inter-table relationships required careful lifecycle management. The final migration is about cleanup, not features.

## Key Patterns Discovered

### 1. Updatable Views as API Surface

Rather than exposing raw tables, NRG exposes views with `INSTEAD OF` triggers. This:
- Simplifies the Node.js layer
- Centralizes business logic in the database
- Ensures consistency across different access paths

### 2. Activity Log Pattern

Changes go through activity tables. Triggers interpret activities and apply them. This provides:
- Audit trail
- Complex operations from simple inserts
- Database-level validation

### 3. Trigger-Based Security

Critical security checks happen in triggers:
- Secret hashing
- Blocklist enforcement
- Authenticity invalidation

The application can't bypass these checks.

### 4. View Hierarchy for Authorization

```
Raw tables → Joined views → Filtered views → Decision view
```

Each layer adds context until `unified_active_site_policies` gives a direct allow/deny answer.

## Technical Debt Notes

1. **Fill pattern modulo math**: The `(num % (total + 1))` formula can produce unexpected results. Documented as requiring matched segment/pattern counts.

2. **String-based arrays**: `schedule_segments` and `fill_pattern` are stored as comma-separated strings, not PostgreSQL arrays. Works but adds parsing overhead.

3. **Trigger complexity**: Some triggers are 200+ lines of PL/pgSQL. Testing database triggers is harder than testing application code.

4. **Schedule type**: Only `week` is implemented. Monthly and daily schedules are schema-ready but not built.

## Summary

The migration history reveals a project that:

1. **Started with clear domain understanding** - the three access modes were there from day one
2. **Iterated on query patterns** - views evolved to match access patterns
3. **Centralized logic in the database** - triggers handle complexity
4. **Hardened security progressively** - blocklists and validation were added as threats were understood
5. **Prioritized audit and consent** - HIPAA-adjacent concerns drove the joined_groups and activity patterns

The schema is sophisticated because the problem domain is sophisticated. Managing time-based, identity-aware access to health data requires this level of control.
