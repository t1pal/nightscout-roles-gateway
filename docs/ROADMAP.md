# NRG Roadmap

This document outlines planned features, enhancement opportunities, and technical debt items for the Nightscout Roles Gateway.

## Current State Summary

NRG is a functional RBAC gateway with:
- Three-mode access control (Anonymous, Identity-Mapped, API Secret)
- Group-based policies with email identity matching
- Weekly schedule support
- BYOD validation pipeline
- Consent tracking

**Implementation Status Notes**:
- Mode A (Anonymous) and Mode C (API Secret) are fully functional
- Mode B (Identity-Mapped) works for basic allow/deny policies
- `nsjwt` policy type is partially implemented - the decision logic checks for it, but the upstream JWT exchange with Nightscout is not fully wired up (see code TODOs)
- Rate limiting is not implemented
- External dependencies (ORY Kratos/Hydra) must be configured for identity features

## Planned Features (from Code Comments)

These features are referenced in the codebase but not yet implemented:

### Extended Identity Types

**Current**: Only `email` and `anonymous` identity types are implemented.

**Planned** (from `group_inclusion_specs` schema):
- `organization` - Match based on organization claims from identity provider
- `subject` - Match specific user IDs directly
- `group` - Reference other groups (nested group membership)

**Implementation hints**:
- Add matching logic in `lib/privy/index.js`
- Update `unified_active_site_policies` view to handle new types
- Consider performance implications of nested group lookups

### Extended Schedule Types

**Current**: Only `week` schedule type is implemented.

**Planned** (from `scheduled_policies` schema):
- `day` - Daily recurring schedules
- `month` - Monthly schedules
- `one-time` - Non-recurring date ranges

**Implementation hints**:
- Modify `site_policy_schedules` view to handle different anchors
- Day: anchor at midnight
- Month: anchor at first of month
- One-time: absolute timestamps instead of offsets

### Enhanced Criteria Checks

**Current**: Static analysis, API liveness, authenticated status check.

**Planned** (from `lib/criteria/core.js` comments):

| Harness | Property | Criteria |
|---------|----------|----------|
| http | `/api/v1/entries.json` | reachable, has_data |
| http | `/api/v1/treatments.json` | reachable, has_data |
| http | `/api/v1/devicestatus.json` | reachable, has_data |
| http | `/api/v1/profiles.json` | reachable, has_data |
| security | `/api/v3/version` | handshake |
| security | `/api/v1/experiments/test` | handshake |
| security | `/api/v1/verifyauth` | handshake |
| subjects | `/api/v2/authorization/subjects` | list, with-vetted-list |
| roles | `/api/v2/authorization/roles` | with-vetted-list |
| JWTS | `/api/v2/authorization/request/token` | issue |

**Why these matter**:
- Data availability checks confirm active Nightscout usage
- API v3 checks verify modern Nightscout versions
- Authorization system checks enable `nsjwt` policy type

### Activity Logging for Access

**Current**: `permission_assignment_activities` logs policy changes.

**Planned** (from `docs/privy-identity-access.md`):
- Log each access event for consented users
- Track: timestamp, subject, site, endpoint accessed
- Enable audit reports for site owners

**Implementation hints**:
- New table: `access_activities`
- Trigger from warden endpoints when access granted
- Consider privacy implications and retention policies

## Enhancement Opportunities

### 1. Improve Schedule Fill Pattern Logic

**Problem**: The modulo formula `(num % (total + 1))` can skip segments when counts don't match.

**Solution**: Change to `((num - 1) % total) + 1` for predictable cycling.

**Files affected**: `migrations/20220516185528_create_schedule_arrays.js`

**Risk**: Requires migration that could affect existing schedules.

### 2. Native PostgreSQL Array Types

**Problem**: `schedule_segments` and `fill_pattern` are comma-separated strings, requiring parsing.

**Solution**: Use `INTEGER[]` and `TEXT[]` native types.

**Benefits**:
- Better type safety
- Direct array indexing
- Cleaner SQL

**Risk**: Breaking change for existing data; needs migration with data conversion.

### 3. Schedule Caching

**Problem**: `site_policy_schedules_active` recalculates on every request.

**Solution**: Materialize active schedules with cache invalidation:
- Calculate on schedule change
- Recalculate hourly for time-based expiry
- Use PostgreSQL materialized view or Redis cache

**Files affected**: `lib/policies/index.js`, potentially new caching layer

### 4. Trigger Refactoring

**Problem**: Some triggers are 200+ lines of PL/pgSQL, hard to test and debug.

**Solution**: Move complex logic to stored procedures; triggers call procedures.

**Benefits**:
- Easier unit testing of procedures
- Reusable logic
- Clearer separation of concerns

### 5. nsjwt Token Caching

**Problem**: Each `nsjwt` policy requires an HTTP exchange with upstream Nightscout.

**Solution**: Cache JWTs with TTL matching token expiry (typically 1 hour).

**Implementation**:
- Add `token_cache` table or use Redis
- Key: `site_id + subject`
- Value: JWT, expiry timestamp
- Check cache before upstream exchange

## Technical Debt

### High Priority

1. **Test Coverage for Triggers**
   - Database triggers have minimal testing
   - Add pgTAP or pg_prove tests for critical paths
   - Especially: secret hashing, cascade cleanup, schedule evaluation

2. **Error Messages in Triggers**
   - Current: `RAISE EXCEPTION 'cannot be a reserved upstream_origin'`
   - Better: Include which rule matched, suggestion for fix

3. **Migration Documentation**
   - Add inline comments explaining complex SQL
   - Document trigger dependencies in migration files

### Medium Priority

1. **View Performance**
   - Profile `unified_active_site_policies` under load
   - Consider selective denormalization for hot paths
   - Add EXPLAIN ANALYZE to test suite

2. **Secrets Table Sync**
   - The trigger-based sync can silently fail
   - Add health check that compares tables
   - Alert on drift

3. **Reserved Lists Management**
   - Currently seed data or manual insertion
   - Add admin API for managing blocklists
   - Consider loading from config file on startup

### Low Priority

1. **Dead Code Cleanup**
   - Commented-out code in migrations
   - Unused columns (e.g., `admin_spec` in `registered_sites`)
   - Remove or document

2. **Consistent Naming**
   - `expected_name` vs `vanity_name`
   - `policy_spec` vs `spec`
   - Standardize across codebase

3. **API Documentation**
   - OpenAPI/Swagger spec for all endpoints
   - Currently documented in Markdown only

## Security Roadmap

### Rate Limiting

- Not currently implemented
- Add per-IP and per-site rate limits
- Consider Redis-based sliding window

### API Secret Strength Requirements

- Currently: minimum 12 characters
- Consider: entropy requirements, common password rejection

### Audit Log Retention

- Define retention policy for activity logs
- Implement automated cleanup
- Consider compliance requirements (HIPAA, GDPR)

### mTLS for Upstream Connections

- Currently: HTTPS only
- Consider: mutual TLS for high-security upstreams
- Store client certificates per-site

## Feature Requests (User-Driven)

Based on documentation and schema design, these appear to be anticipated features:

### 1. Group Discovery

Schema has commented-out `allow_discovery` on `group_definitions`.

**Use case**: Public groups that users can join without invitation.

### 2. Multi-Site Policies

Apply a single policy to multiple sites at once.

**Use case**: School nurse needs same access to all students in a class.

### 3. Temporary Access Links

Generate time-limited access without identity provider login.

**Use case**: Share with someone who doesn't have a Kratos account.

### 4. Webhook Notifications

Notify external systems on access events.

**Use case**: Integrate with school attendance systems, logging platforms.

### 5. Policy Templates

Pre-defined policy+schedule combinations.

**Use case**: "School Hours Template" that owners can apply with one click.

## Compatibility Notes

### Nightscout Version Requirements

| Feature | Minimum NS Version |
|---------|-------------------|
| Basic proxy | Any |
| API secret verification | Any |
| `nsjwt` token exchange | 14.0+ (with subjects API) |
| Shiro permissions | 14.0+ |

### Breaking Changes to Avoid

1. **View column names** - External queries may depend on them
2. **API response shapes** - Document before changing
3. **Trigger timing** - BEFORE vs AFTER can affect behavior

## Next Steps Priority

1. **Add organization identity type** - Most requested extension
2. **Improve schedule math** - Fix the modulo edge case
3. **Add access logging** - Compliance requirement
4. **Performance testing** - Validate scale assumptions
5. **Trigger test suite** - Reduce regression risk
