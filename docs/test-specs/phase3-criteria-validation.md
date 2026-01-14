# Test Specification: Phase 3 - BYOD Criteria Validation

This document specifies the expected behaviors for the criteria system that validates Nightscout instances during BYOD (Bring Your Own Nightscout) registration.

## Overview

The criteria system serves as a security gate to prevent NRG from being misused as an open proxy. It validates:

1. **Static Analysis** - API secret syntax, URL format
2. **Basic API Inspection** - Upstream Nightscout reachability
3. **Authenticated API Inspection** - API secret verification

---

## 1. Static Analysis

### API Secret Syntax Validation

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| SA-01 | Valid API secret (12+ chars) | `"mysupersecret123"` | `passing: true` |
| SA-02 | Minimum length (12 chars) | `"exactly12chr"` (12 chars) | `passing: true` |
| SA-03 | Too short (11 chars) | `"only11chars"` (11 chars) | `passing: false`, `mandatory: true` |
| SA-04 | Empty string | `""` | `passing: false`, `mandatory: true` |
| SA-05 | Very long secret | 256 character string | `passing: true` |

### URL Syntax Validation

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| SA-06 | Valid HTTPS URL | `"https://ns.example.com"` | `passing: true` |
| SA-07 | Valid HTTP URL | `"http://ns.example.com"` | `passing: true` |
| SA-08 | URL with path | `"https://ns.example.com/nightscout"` | `passing: true` |
| SA-09 | URL with port | `"https://ns.example.com:8080"` | `passing: true` |
| SA-10 | Empty URL | `""` | `passing: false`, `mandatory: true` |
| SA-11 | Missing protocol | `"ns.example.com"` | `passing: false` (no hostname parsed) |
| SA-12 | Invalid URL | `"not-a-url"` | `passing: false` |
| SA-13 | Localhost URL | `"http://localhost:1337"` | `passing: true` (hostname exists) |
| SA-14 | IP address URL | `"http://192.168.1.1:1337"` | `passing: true` |

### Static Analysis Result Structure

```javascript
{
  group: 'Nightscout API Secret',  // or 'Nightscout URL'
  property: 'api secret',          // or 'url syntax'
  criteria: 'must be minimum length',
  outcome: 'api secret length is 16',
  passing: true,
  mandatory: true
}
```

---

## 2. Basic API Inspection

### Upstream Reachability (No Auth)

| ID | Scenario | Upstream Response | Expected |
|----|----------|-------------------|----------|
| BI-01 | Nightscout reachable, healthy | 200 from `/api/v1/status.json` | `passing: true` |
| BI-02 | Nightscout returns 401 | 401 Unauthorized | `passing: false` (status != 200) |
| BI-03 | Nightscout returns 500 | 500 Internal Server Error | `passing: false` |
| BI-04 | Nightscout unreachable | Connection timeout | `passing: false` |
| BI-05 | DNS resolution fails | Unknown host | `passing: false` |
| BI-06 | Empty hostname | URL with no hostname | `passing: false`, immediate return |
| BI-07 | SSL certificate error | Invalid SSL | `passing: false` (axios throws) |

### Basic Inspection Result Structure

```javascript
{
  group: 'Nightscout API',
  property: 'status endpoint',
  criteria: 'must be ok',
  outcome: 'nightscout api status endpoint is 200',
  passing: true,
  mandatory: true
}
```

---

## 3. Authenticated API Inspection

### API Secret Verification

| ID | Scenario | Setup | Expected |
|----|----------|-------|----------|
| AI-01 | Valid API secret, Nightscout accepts | Correct hashed secret, 200 response | `passing: true` |
| AI-02 | Invalid API secret | Wrong secret, 401 response | `passing: false` |
| AI-03 | API secret hashing | Secret properly SHA1 hashed | Header matches Nightscout expectation |
| AI-04 | Authenticated but error | Correct secret, 500 response | `passing: false` |
| AI-05 | Empty hostname | URL with no hostname | `passing: false`, immediate return |

### Hash Verification

```javascript
// Expected behavior: SHA1 hash of plain text secret
const crypto = require('crypto');
const shasum = crypto.createHash('sha1');
shasum.update('my-api-secret');
const hashedSecret = shasum.digest('hex');
// Should be sent as API-SECRET header
```

---

## 4. Complete Inspection Pipeline

### Harness Function

The harness runs all inspections in parallel:

```javascript
var inspections = [
  static_analysis(cfg),
  basic_api_inspection(cfg),
  api_secret_api_inspection(cfg)
];
return Promise.all(inspections);
```

### Pipeline Test Cases

| ID | Scenario | Static | Basic | Auth | Final Status |
|----|----------|--------|-------|------|--------------|
| HP-01 | All pass | Pass | Pass | Pass | `acceptable: true` |
| HP-02 | Short secret | Fail | Pass | Pass | `acceptable: false` |
| HP-03 | Unreachable | Pass | Fail | Fail | `acceptable: false` |
| HP-04 | Wrong secret | Pass | Pass | Fail | `acceptable: false` |
| HP-05 | Bad URL syntax | Fail | Fail | Fail | `acceptable: false` |
| HP-06 | Partial pass (non-mandatory) | Pass | Pass + Warn | Pass | `acceptable: true` |

---

## 5. Description/Summary Generation

### `describe()` Function

| ID | Scenario | Input | Expected Output |
|----|----------|-------|-----------------|
| DS-01 | All passing | `[{passing: true, mandatory: true}]` | `status: 'OK'`, `acceptable: true` |
| DS-02 | One mandatory failure | `[{passing: false, mandatory: true}]` | `status: 'not ok'`, `acceptable: false` |
| DS-03 | Optional warning | `[{passing: false, mandatory: false}]` | `status: 'OK'`, warning in text |
| DS-04 | Multiple failures | 2 mandatory failures | `acceptable: false`, mentions "2 serious issues" |
| DS-05 | Mixed results | 2 pass, 1 warning, 1 fatal | `acceptable: false`, mentions both |

### Description Result Structure

```javascript
{
  txt: 'Nightscout is OK.  There are 1 details that may indicate...',
  status: 'OK',
  acceptable: true,
  details: {
    passing: 3,
    warning: 1,
    rejects: 0
  }
}
```

---

## 6. Database Storage

### Inspection Tables

#### `nightscout_inspection_details`

| ID | Scenario | Expected Storage |
|----|----------|-----------------|
| DB-01 | New inspection | Record created with synopsis |
| DB-02 | Re-inspection | Record updated or new version |

#### `nightscout_inspection_results`

| ID | Scenario | Expected Storage |
|----|----------|-----------------|
| DB-03 | Individual criteria | Each criterion stored as row |
| DB-04 | Result retrieval | Can reconstruct full inspection |

---

## 7. Integration with Site Registration

### BYOD Site Flow

```
1. User submits upstream_origin + api_secret
2. Criteria system runs inspection
3. Results stored in inspection tables
4. Site registered with acceptable status
5. Warden enforces acceptable gate if strictly_nightscout=true
```

### Test Cases

| ID | Scenario | Expected |
|----|----------|----------|
| SR-01 | Valid Nightscout registered | Site created, `acceptable: true` |
| SR-02 | Invalid Nightscout rejected | Site may be created with `acceptable: false` |
| SR-03 | Re-validation updates status | Acceptable can change from false to true |

---

## 8. Error Handling

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| EH-01 | Network timeout | Inspection fails gracefully, returns result |
| EH-02 | Axios error | Caught in `.catch()`, result pushed |
| EH-03 | Malformed response | Should not crash, mark as failing |
| EH-04 | Null/undefined config | Validation should fail early |
| EH-05 | Missing api_secret field | Static analysis should handle |

---

## 9. Mock Requirements

### Nightscout API Mock

```javascript
const nightscoutMock = {
  // Healthy Nightscout
  healthy: {
    'GET /api/v1/status.json': {
      status: 200,
      body: { status: 'ok', version: '14.2.6' }
    }
  },
  
  // Requires auth
  requiresAuth: {
    'GET /api/v1/status.json': {
      status: 401,
      body: { status: 'Unauthorized' }
    }
  },
  
  // Authenticated
  authenticated: {
    'GET /api/v1/status.json': (req) => {
      if (req.headers['API-SECRET'] === expectedHash) {
        return { status: 200, body: { status: 'ok' } };
      }
      return { status: 401 };
    }
  },
  
  // Server error
  serverError: {
    'GET /api/v1/status.json': {
      status: 500,
      body: { error: 'Internal Server Error' }
    }
  },
  
  // Unreachable
  unreachable: new Error('ECONNREFUSED')
};
```

---

## 10. Test File Organization

```
test/
├── unit/
│   └── criteria/
│       ├── static_analysis.test.js      # SA-01 through SA-14
│       ├── basic_inspection.test.js     # BI-01 through BI-07
│       ├── auth_inspection.test.js      # AI-01 through AI-05
│       ├── harness.test.js              # HP-01 through HP-06
│       └── describe.test.js             # DS-01 through DS-05
├── integration/
│   └── criteria/
│       ├── full_pipeline.test.js        # End-to-end inspection
│       └── registration_flow.test.js    # SR-01 through SR-03
└── mocks/
    └── nightscout.js
```

---

## 11. Test Data Fixtures

```javascript
const fixtures = {
  validConfig: {
    upstream_origin: 'https://valid-ns.herokuapp.com',
    api_secret: 'valid-api-secret-12345'
  },
  
  shortSecret: {
    upstream_origin: 'https://valid-ns.herokuapp.com',
    api_secret: 'short'
  },
  
  badUrl: {
    upstream_origin: 'not-a-url',
    api_secret: 'valid-api-secret-12345'
  },
  
  emptyConfig: {
    upstream_origin: '',
    api_secret: ''
  },
  
  localhostConfig: {
    upstream_origin: 'http://localhost:1337',
    api_secret: 'local-test-secret'
  }
};
```

---

## 12. Planned Criteria (Not Yet Implemented)

Based on comments in code, additional criteria are planned:

| Criterion | Endpoint | Purpose |
|-----------|----------|---------|
| Entries reachable | `/api/v1/entries.json` | Verify data access |
| Entries has data | `/api/v1/entries.json` | Optional: confirm data exists |
| Treatments reachable | `/api/v1/treatments.json` | Verify treatment access |
| Profiles reachable | `/api/v1/profiles.json` | Verify profile access |
| V3 version handshake | `/api/v3/version` | Modern API check |
| Auth verification | `/api/v1/verifyauth` | Explicit auth check |
| Subjects list | `/api/v2/authorization/subjects` | NSJWT capability |
| JWT issuance | `/api/v2/authorization/request/token` | Token exchange capability |

---

## Appendix: Coverage Mapping

| Code Path | Spec IDs |
|-----------|----------|
| `check_api_secret_syntax()` | SA-01 to SA-05 |
| `static_analysis()` | SA-01 to SA-14 |
| `basic_api_inspection()` | BI-01 to BI-07 |
| `api_secret_api_inspection()` | AI-01 to AI-05 |
| `harness()` | HP-01 to HP-06 |
| `describe()` | DS-01 to DS-05 |
| Error handling | EH-01 to EH-05 |
