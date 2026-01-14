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

### Unit Tests

Test isolated functions with mocked dependencies:
- `decision()` function logic paths
- `static_analysis()` validation rules
- Email normalization

### Integration Tests

Test API endpoints with database fixtures:
- Full warden request flow
- Invitation acceptance workflow
- Complete BYOD inspection pipeline

## Related Documentation

- [Access Modes](../access-modes.md) - The three orthogonal access conditions
- [Warden Gateway](../warden-gateway.md) - Authorization layer details
- [Privy Identity Access](../privy-identity-access.md) - Identity module details
- [Criteria System](../criteria-system.md) - BYOD validation pipeline
