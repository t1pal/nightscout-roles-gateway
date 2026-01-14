# NRG Test Specifications

This directory contains test specifications that define the expected behaviors of the Nightscout Roles Gateway. These specifications serve as the source of truth for writing both unit and integration tests.

## Documents

| Phase | Document | Coverage |
|-------|----------|----------|
| Phase 1 | [phase1-authorization.md](./phase1-authorization.md) | Policy resolution, decision logic, access modes, warden gateway |
| Phase 2 | [phase2-identity-access.md](./phase2-identity-access.md) | Privy module, identity resolution, group membership, consent flow |
| Phase 3 | [phase3-criteria-validation.md](./phase3-criteria-validation.md) | BYOD criteria validation, Nightscout inspection pipeline |
| Phase 4 | [phase4-triggers.md](./phase4-triggers.md) | PostgreSQL triggers, secret hashing, cascade cleanup, reserved names |

## How to Use These Specs

### Writing New Tests

1. Find the relevant specification document for the feature you're testing
2. Locate the test case ID (e.g., `D-01`, `SI-03`, `BI-05`)
3. Use the expected behaviors as assertions in your test

### Test Naming Convention

Reference spec IDs in test names for traceability:

```javascript
describe('decision()', function() {
  it('D-01: should deny when site is disabled', function() {
    // Test implementation
  });
  
  it('D-04: should allow when require_identities and ACL allows', function() {
    // Test implementation
  });
});
```

### Coverage Tracking

Each spec document includes an **Appendix: Coverage Mapping** table that maps code paths to spec IDs. Use this to ensure complete coverage.

## Priority Order

1. **Phase 1** - Authorization is the security boundary and should be tested first
2. **Phase 2** - Identity and consent flow enables the identity-mapped access mode
3. **Phase 3** - Criteria validation protects against proxy abuse
4. **Phase 4** - PostgreSQL triggers enforce data integrity at the database level

## Test Types

### View Tests (Implemented)

Test PostgreSQL views for accuracy without external network dependencies:
- `site_policy_schedules` - Schedule expansion and fill_pattern pairing
- `site_policy_schedules_active` - Time window filtering
- `unified_active_site_policies` - COALESCE merge logic and ACL sort order

Location: `test/views/`

**Key Insight**: These views use PostgreSQL-specific features (UNNEST, string_to_array, window functions) and cannot be tested with SQLite. Tests must use PostgreSQL.

### Trigger Tests (Implemented)

Test PostgreSQL trigger behaviors directly against the database:
- `sync_hashed_api_secret` - Secret hashing on INSERT/UPDATE/DELETE
- `remove_joined_groups_via_policy` - Cascade cleanup on policy delete
- `force_leave_group` - Cascade cleanup on inclusion spec delete
- `check_site_reserved_name` - Reserved name validation
- `initialize_connection_policy_sort` - Sort order initialization (quirk documented)

Location: `test/triggers/`

**Key Insight**: Trigger tests verify database-level business rules without requiring HTTP mocking or external services.

### Unit Tests

Test isolated functions with mocked dependencies:
- `decision()` function logic paths
- `matches_api_secret()` API secret validation (AS-01 to AS-07, AS-FB01 to AS-FB03)
- `static_analysis()` validation rules
- `describe()` summary/result generation (DS-01 to DS-05)
- Email normalization

Location: `test/unit/` and `test/unit/criteria/`

### Integration Tests

Test API endpoints with database fixtures:
- Full warden request flow
- Invitation acceptance workflow
- Complete BYOD inspection pipeline

## Running Tests

```bash
# Run all tests
NODE_ENV=test npm test

# Run view tests only
NODE_ENV=test npm test -- --grep "View:"

# Run trigger tests only
NODE_ENV=test npm test -- --grep "Trigger:"

# Run specific view test
NODE_ENV=test npm test -- --grep "site_policy_schedules"

# Run specific trigger test
NODE_ENV=test npm test -- --grep "sync_hashed_api_secret"
```

## Test Coverage Summary

| Area | Spec IDs | Tests | Status |
|------|----------|-------|--------|
| View: site_policy_schedules | SPV-* | 6 | ✅ Implemented |
| View: site_policy_schedules_active | SPVA-* | 6 | ✅ Implemented |
| View: unified_active_site_policies | UASP-* | 8 | ✅ Implemented |
| Static analysis | SA-01 to SA-14 | 19 | ✅ Implemented |
| describe() summary | DS-01 to DS-05 | 8 | ✅ Implemented |
| Decision function | D-01 to D-09 | 15 | ✅ Implemented |
| API secret matching | AS-01 to AS-07, AS-FB01 to AS-FB03 | 10 | ✅ Implemented |
| Email normalization | GI-01 to GI-04 | 11 | ✅ Implemented |
| Site lookup | SL-01 to SL-05 | 6 | ✅ Implemented |
| Trigger: sync_hashed_api_secret | TRG-HS-01 to TRG-HS-14 | 15 | ✅ Implemented |
| Trigger: cascade cleanup | TRG-CC-01 to TRG-CC-07 | 7 | ✅ Implemented |
| Trigger: reserved validation | TRG-RN-01 to TRG-RN-12 | 12 | ✅ Implemented |
| Trigger: sort order | TRG-SO-01 to TRG-SO-06 | 6 | ✅ Implemented (quirk documented) |
| Kratos identity | IR-* | - | 🔲 Requires mocking |
| API inspection | BI-*, AI-* | - | 🔲 Requires network |

*Last updated: January 2026*

## Next Steps for Contributors

With Site Lookup tests now complete, the handler chain from site resolution through decision is well-covered. The next high-value testing opportunities are:

1. **Warden end-to-end integration tests** (E2E-01 to E2E-06 in phase1-authorization.md) - This would exercise the complete handler chain with real database fixtures, providing the highest confidence that all components work together correctly.

2. **Kratos identity resolution** (IR-*) - Requires mocking the Ory Kratos API responses. Use the same mocking pattern established in the policy tests.

3. **ACL lookup tests** (ACL-01 to ACL-04) - Test `get_acls` and `get_acl_by_identity_param` handlers which populate `res.locals.acl` from the unified view.

## Discovered Quirks

See `test/quirks/README.md` for documented edge cases and unexpected behaviors observed during testing. Key findings:

| Quirk ID | Summary |
|----------|---------|
| SPV-Q01 | Mismatched fill_pattern and segment count uses modulo cycling |
| SPVA-Q01 | Schedule filtering uses database server time, not client time |
| UASP-Q01 | COALESCE skips NULL schedule specs (by design) |
| UASP-Q02 | Multiple active schedules per policy create duplicate ACL entries |
| SL-Q01 | Unique constraint on expected_name prevents duplicate sites (by design) |
| TRG-SO-Q01 | Sort order trigger not installed (migration bypass) |
| TRG-HS-Q01 | api_secret column limited to 255 characters |

## Related Documentation

- [Access Modes](../access-modes.md) - The three orthogonal access conditions
- [Warden Gateway](../warden-gateway.md) - Authorization layer details
- [Privy Identity Access](../privy-identity-access.md) - Identity module details
- [Criteria System](../criteria-system.md) - BYOD validation pipeline
