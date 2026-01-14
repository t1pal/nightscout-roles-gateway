# NRG Maintenance Guide

This guide provides practical information for debugging, maintaining, and extending the Nightscout Roles Gateway.

## Understanding the System Layers

```
┌─────────────────────────────────────────────┐
│           Application Layer                 │
│     lib/routes.js, lib/policies/            │
│     lib/entities/, lib/owner/               │
├─────────────────────────────────────────────┤
│           Query Layer (Views)               │
│   site_acls, site_policy_overview,          │
│   unified_active_site_policies              │
├─────────────────────────────────────────────┤
│           Trigger Layer                     │
│   before/after insert triggers,             │
│   cascade cleanup, validation               │
├─────────────────────────────────────────────┤
│           Core Tables                       │
│   registered_sites, group_definitions,      │
│   connection_policies, scheduled_policies   │
└─────────────────────────────────────────────┘
```

**Key insight**: Problems can occur at any layer. A 403 error might be:
- Application logic (check `lib/policies/index.js`)
- View computation (check `unified_active_site_policies`)
- Missing data (check core tables directly)
- Trigger failure (check PostgreSQL logs)

## External Dependencies

NRG requires these external services for full functionality:

| Service | Purpose | Environment Variable |
|---------|---------|---------------------|
| PostgreSQL | Production database | `KNEX_CONNECT` |
| ORY Kratos | User identity management | `KRATOS_API` |
| ORY Hydra | OAuth2 flows | `HYDRA_API` |

**Note**: Without Kratos/Hydra configured, Mode B (identity-mapped access) will not function. Mode A (anonymous) and Mode C (API secret) work independently.

## Common Debugging Scenarios

## Warden Endpoint Contract

The warden endpoint (`/warden/decision/:expected_name`) is called by the load balancer (NGINX) to make access decisions.

### Request Headers Expected

| Header | Purpose | Required |
|--------|---------|----------|
| `API-SECRET` | Hashed secret for Mode C bypass | For uploaders |
| `x-policy-id` | Policy ID to check | For Mode B |
| `x-group-id` | Group ID filter | Optional |
| `x-email-spec` | Email to match | Optional |

### Response Headers Set (on success)

| Header | Value |
|--------|-------|
| `x-upstream-origin` | The Nightscout URL to proxy to |
| `x-forwarded-host` | The upstream hostname |

### Response Codes

| Code | Meaning |
|------|---------|
| 200 | Access granted, check response headers |
| 403 | Access denied |
| 404 | Site not found |

### Scenario 1: User Can't Access a Site

**Symptoms**: User gets 403 Forbidden when they should have access.

**Debug checklist**:

```sql
-- 1. Is the site enabled?
SELECT id, expected_name, is_enabled, require_identities, exempt_matching_api_secret
FROM registered_sites
WHERE expected_name = 'sitename';

-- 2. Does the user have a joined_groups record?
SELECT * FROM joined_groups
WHERE expected_name = 'sitename';

-- 3. Is there an active policy?
SELECT * FROM unified_active_site_policies
WHERE expected_name = 'sitename';

-- 4. If scheduled, what does the schedule show?
SELECT * FROM site_policy_schedules
WHERE expected_name = 'sitename';

-- 5. What's the current active segment?
SELECT * FROM site_policy_schedules_active
WHERE expected_name = 'sitename';
```

**Common causes**:
- `is_enabled = false` on the site
- No matching `joined_groups` record (user didn't consent)
- Schedule segment evaluates to `deny` at current time
- Group inclusion spec doesn't match user's email (check case normalization)

### Scenario 2: API Secret Not Working (Mode C)

**Symptoms**: Uploader gets 403 even with correct API secret.

**Debug checklist**:

```sql
-- 1. Is the escape hatch enabled?
SELECT exempt_matching_api_secret FROM registered_sites
WHERE expected_name = 'sitename';

-- 2. Is the secret in the secrets table?
SELECT * FROM nightscout_secrets
WHERE expected_name = 'sitename';

-- 3. Does the hash match? (Test with a known secret)
SELECT encode(digest('your-api-secret', 'sha1'), 'hex');
```

**Common causes**:
- `exempt_matching_api_secret = false`
- Secret not synced to `nightscout_secrets` (trigger issue)
- Hash mismatch (secret changed but old hash stored)

### Scenario 3: Schedule Not Working as Expected

**Symptoms**: Access granted/denied at wrong times.

**Debug checklist**:

```sql
-- 1. Check the raw schedule definition
SELECT schedule_segments, fill_pattern
FROM site_policy_overview
WHERE expected_name = 'sitename' AND schedule_id IS NOT NULL;

-- 2. See the expanded segments
SELECT start, "end", spec, fill_num, total
FROM site_policy_schedules
WHERE expected_name = 'sitename'
ORDER BY start;

-- 3. Check current time's position
SELECT 
  EXTRACT(EPOCH FROM (now() - (date_trunc('week', now() + interval '1 day') - interval '1 day')))::int 
  AS seconds_since_anchor;
```

**Common causes**:
- Fill pattern count doesn't match segment count (modulo issue)
- Timezone confusion (schedules use server time)
- Week anchor calculation (Sunday midnight = 0)

### Scenario 4: BYOD Site Not Activating

**Symptoms**: Registered site shows as not acceptable.

**Debug checklist**:

```sql
-- 1. Check inspection results
SELECT * FROM nightscout_inspection_results
WHERE expected_name = 'sitename';

-- 2. Check individual criteria
SELECT * FROM nightscout_inspection_details
WHERE expected_name = 'sitename';

-- 3. Check authenticity record
SELECT * FROM nightscout_authenticity_records
WHERE expected_name = 'sitename';
```

**Common causes**:
- Nightscout instance not reachable
- API secret invalid (failed authenticated check)
- Upstream origin changed (invalidates certificate)

### Scenario 5: Site Registration Fails

**Symptoms**: Error when trying to register a new site.

**Debug checklist**:

```sql
-- 1. Is the expected_name reserved?
SELECT * FROM reserved_expected_names
WHERE reserved_expected_name SIMILAR TO 'sitename';

-- 2. Is the upstream reserved?
SELECT * FROM reserved_upstream_origin
WHERE 'https://mysite.herokuapp.com' SIMILAR TO reserved_upstream;

-- 3. Is expected_name already taken?
SELECT * FROM registered_sites
WHERE expected_name = 'sitename';
```

**Common causes**:
- Reserved name (admin, api, www, etc.)
- Reserved upstream (localhost, internal services)
- Duplicate expected_name

## Trigger Dependencies

Understanding trigger order is critical for debugging:

### On `registered_sites` INSERT/UPDATE

1. `check_site_reserved_upstream()` - Validates upstream not blocklisted
2. `sync_hashed_api_secret()` - Hashes secret, clears plaintext

### On `registered_sites` UPDATE (upstream_origin change)

1. `invalidate_previous_result_certificates()` - Clears authenticity record

### On `nightscout_inspection_results` INSERT

1. `upsert_nightscout_results_certificate()` - Creates/updates authenticity record

### On `permission_assignment_activities` INSERT

1. `before_insert_permission_assignment_activity()` - Validates and enriches
2. `after_insert_permission_assignment_activity()` - Applies the change

### On `connection_policies` DELETE

1. `remove_joined_groups_via_policy()` - Cleans up consent records

### On `site_registration_initializations` DELETE

1. `delete_site_resources()` - Cascades cleanup to all related tables

## Database Maintenance

### Checking for Orphaned Records

```sql
-- Orphaned policies (site deleted)
SELECT * FROM connection_policies cp
WHERE NOT EXISTS (SELECT 1 FROM registered_sites rs WHERE rs.id = cp.site_id);

-- Orphaned schedules (policy deleted)
SELECT * FROM scheduled_policies sp
WHERE NOT EXISTS (SELECT 1 FROM connection_policies cp WHERE cp.id = sp.policy_id);

-- Orphaned joined_groups (policy deleted)
SELECT * FROM joined_groups jg
WHERE NOT EXISTS (SELECT 1 FROM connection_policies cp WHERE cp.id = jg.policy_id);
```

### Cleaning Up Test Data

```sql
-- Delete a site and cascade all resources
DELETE FROM site_registration_initializations
WHERE expected_name = 'test-site';
```

**Important**: Use the view, not the table directly. The trigger handles cascade.

### Repairing Broken Secret Sync

```sql
-- If secrets table is out of sync with registered_sites
INSERT INTO nightscout_secrets (id, expected_name, api_secret, hashed_api_secret)
SELECT id, expected_name, '', encode(digest(api_secret, 'sha1'), 'hex')
FROM registered_sites
WHERE api_secret IS NOT NULL AND api_secret != ''
ON CONFLICT (expected_name) DO UPDATE SET
  hashed_api_secret = EXCLUDED.hashed_api_secret;
```

## Application-Level Debugging

### Logging

The application uses Bunyan for logging. Check for:

```bash
# In workflow logs
grep -i "403" /tmp/logs/*.log
grep -i "decision" /tmp/logs/*.log
grep -i "policy" /tmp/logs/*.log
```

### Key Code Paths

| Symptom | Check This File |
|---------|-----------------|
| 403 on any request | `lib/policies/index.js` - `decision()` function |
| Group matching issues | `lib/privy/index.js` - identity resolution |
| Registration failures | `lib/registrations/index.js` |
| Owner API issues | `lib/owner/index.js` |
| Criteria validation | `lib/criteria/core.js` |

### Testing a Policy Decision

```javascript
// In Node.js REPL or test
const policies = require('./lib/policies');

// Simulate a decision
const result = await policies.decision({
  expected_name: 'sitename',
  api_secret: 'test-secret',
  identity: { email: 'user@example.com' }
});
console.log(result);
```

## Migration Safety

### Before Running New Migrations

1. **Backup**: Always backup the database first
2. **Review**: Read the migration's `up` and `down` functions
3. **Triggers**: Note what triggers are created/dropped
4. **Views**: Views depending on modified tables may need recreation

### Rollback Procedure

```bash
# Roll back the last migration
npx knex migrate:rollback

# Roll back all and start fresh (DESTRUCTIVE)
npx knex migrate:rollback --all
npx knex migrate:latest
```

### Adding New Migrations

Follow existing patterns:

```javascript
exports.up = function(knex) {
  return knex.schema.createTable('new_table', function (table) {
    config.createMetadata(table, 'EntityType');
    // columns...
  })
  .then(function () {
    return knex.raw(`
      -- Triggers go here
    `);
  });
};

exports.down = function(knex) {
  return knex.raw(`
    -- Drop triggers first
    DROP TRIGGER IF EXISTS ... CASCADE;
    DROP FUNCTION IF EXISTS ... CASCADE;
  `)
  .then(function () {
    return knex.schema.dropTable('new_table');
  });
};
```

## Performance Considerations

### Slow Queries to Watch

1. **`unified_active_site_policies`** - Joins many tables. Index on `expected_name` and `site_id`.

2. **Schedule evaluation** - `site_policy_schedules_active` does date math. For high traffic, consider caching.

3. **Secret hashing** - SHA-1 on every API secret check. The hash is indexed, but verify the index is used.

### Index Verification

```sql
-- Check index usage
SELECT 
  schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find missing indexes
SELECT 
  relname as table, seq_scan, idx_scan,
  seq_scan - idx_scan as diff
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
ORDER BY diff DESC;
```

## Emergency Procedures

### Disable All Access to a Site

```sql
UPDATE registered_sites
SET is_enabled = false
WHERE expected_name = 'problematic-site';
```

### Block a Malicious Upstream

```sql
INSERT INTO reserved_upstream_origin (reserved_upstream, reason, source)
VALUES ('https://malicious-site.com%', 'Abuse', 'emergency');
```

### Clear All Consent Records for a Site

```sql
DELETE FROM joined_groups
WHERE expected_name = 'sitename';
```

### Force Re-Validation of BYOD Site

```sql
DELETE FROM nightscout_authenticity_records
WHERE expected_name = 'sitename';

DELETE FROM nightscout_inspection_results
WHERE expected_name = 'sitename';
```

Then trigger re-audit through the API.

## Monitoring Suggestions

### Key Metrics to Track

1. **403 rate** - Sudden spikes indicate policy issues
2. **Schedule evaluation time** - Should be < 10ms
3. **Secret hash lookups** - Watch for high miss rate
4. **Trigger execution time** - Via pg_stat_user_functions

### Health Check Queries

```sql
-- Sites without policies (orphaned)
SELECT * FROM registered_sites rs
WHERE NOT EXISTS (
  SELECT 1 FROM connection_policies cp
  WHERE cp.site_id = rs.id
)
AND rs.require_identities = true;

-- Schedules with no active segments ever
SELECT * FROM scheduled_policies sp
WHERE NOT EXISTS (
  SELECT 1 FROM site_policy_schedules sps
  WHERE sps.id = sp.id
);
```
