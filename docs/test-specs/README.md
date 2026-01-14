# NRG Test Specifications

This directory contains test specifications that define the expected behaviors of the Nightscout Roles Gateway. These specifications serve as the source of truth for writing both unit and integration tests.

## Documents

| Phase | Document | Coverage |
|-------|----------|----------|
| Phase 1 | [phase1-authorization.md](./phase1-authorization.md) | Policy resolution, decision logic, access modes, warden gateway |
| Phase 2 | [phase2-identity-access.md](./phase2-identity-access.md) | Privy module, identity resolution, group membership, consent flow |
| Phase 3 | [phase3-criteria-validation.md](./phase3-criteria-validation.md) | BYOD criteria validation, Nightscout inspection pipeline |

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

## Test Types

### View Tests (Implemented)

Test PostgreSQL views for accuracy without external network dependencies:
- `site_policy_schedules` - Schedule expansion and fill_pattern pairing
- `site_policy_schedules_active` - Time window filtering
- `unified_active_site_policies` - COALESCE merge logic and ACL sort order

Location: `test/views/`

**Key Insight**: These views use PostgreSQL-specific features (UNNEST, string_to_array, window functions) and cannot be tested with SQLite. Tests must use PostgreSQL.

### Unit Tests

Test isolated functions with mocked dependencies:
- `decision()` function logic paths
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

# Run specific view test
NODE_ENV=test npm test -- --grep "site_policy_schedules"
```

## Test Coverage Summary

| Area | Spec IDs | Tests | Status |
|------|----------|-------|--------|
| View: site_policy_schedules | SPV-* | 8 | ✅ Implemented |
| View: site_policy_schedules_active | SPVA-* | 6 | ✅ Implemented |
| View: unified_active_site_policies | UASP-* | 7 | ✅ Implemented |
| Static analysis | SA-01 to SA-14 | 19 | ✅ Implemented |
| describe() summary | DS-01 to DS-05 | 8 | ✅ Implemented |
| Decision function | D-01 to D-09 | - | 🔲 Planned |
| Email normalization | GI-01 to GI-04 | - | 🔲 Planned |
| Kratos identity | IR-* | - | 🔲 Requires mocking |
| API inspection | BI-*, AI-* | - | 🔲 Requires network |

## Discovered Quirks

See `test/quirks/README.md` for documented edge cases and unexpected behaviors observed during testing. Key findings:

| Quirk ID | Summary |
|----------|---------|
| SPV-Q01 | Mismatched fill_pattern and segment count uses modulo cycling |
| SPVA-Q01 | Schedule filtering uses database server time, not client time |
| UASP-Q01 | COALESCE skips NULL schedule specs (by design) |
| UASP-Q02 | Multiple active schedules per policy create duplicate ACL entries |

## Related Documentation

- [Access Modes](../access-modes.md) - The three orthogonal access conditions
- [Warden Gateway](../warden-gateway.md) - Authorization layer details
- [Privy Identity Access](../privy-identity-access.md) - Identity module details
- [Criteria System](../criteria-system.md) - BYOD validation pipeline
