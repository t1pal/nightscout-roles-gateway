# Use Cases Matrix: Data Rights Spectrum for Diabetes Care

**Status:** Living Document  
**Last Updated:** January 2026  
**Purpose:** Capture the full spectrum of data rights scenarios and map them to NRG's technical building blocks

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Implemented | Feature is available and working in NRG |
| ⚠️ Partial | Feature exists but has limitations or incomplete integration |
| 🚧 Planned | Feature is on the roadmap but not yet built |
| 🚧 Proposed | Feature is under discussion in proposals |

---

## Quick Reference: README Use Cases

The README lists several example use cases. Here's how they map to this matrix:

| README Example | Matrix Scenario | Section |
|----------------|-----------------|---------|
| Personal sharing | Adult Independent | 1.3, 5.5 |
| School health tech | Pediatric School Day | 1.1, 5.1 |
| Social sharing | Adult with public access | 2.5, 4.1 |
| The special event | Marathon Public Sharing | 5.5 |
| The special guest | Transient Helpers | 3.6, 4.3 |
| Organizational roles | Healthcare Provider Documentation | 3.4, 5.3 |
| BYOD Ownership | Automated Agents | 3.5 |

---

## Introduction

Diabetes data rights exist on a spectrum—from complete personal sovereignty to fully delegated care coordination. This document provides a structured framework for understanding the diverse use cases that NRG must support, organized across four key dimensions:

1. **Care Lifecycle Stage** - Age and autonomy considerations
2. **Context Environment** - Where care coordination happens
3. **Actor Relationships** - Who is involved and in what capacity
4. **Temporal Patterns** - When access is needed

Each dimension intersects to create specific scenarios that require different configurations of NRG's access control capabilities.

---

## Table of Contents

1. [Dimension 1: Care Lifecycle Stages](#dimension-1-care-lifecycle-stages)
2. [Dimension 2: Context Environments](#dimension-2-context-environments)
3. [Dimension 3: Actor Relationships](#dimension-3-actor-relationships)
4. [Dimension 4: Temporal Patterns](#dimension-4-temporal-patterns)
5. [Use Case Scenarios](#use-case-scenarios)
6. [Component Capability Matrix](#component-capability-matrix)
7. [Implementation Status](#implementation-status)

---

## Dimension 1: Care Lifecycle Stages

The nature of data rights changes dramatically across the lifecycle of diabetes experiences.

### 1.1 Pediatric (Ages 0-12)

**Characteristics:**
- Parents/guardians hold primary data rights
- Multiple caregivers need coordinated access (school, daycare, grandparents)
- Child cannot self-advocate; safety nets are essential
- High anxiety situations require broad visibility

**Typical Delegation Pattern:**
```
Parent (Owner) ─┬─► School Nurse (Scheduled: school hours)
                ├─► Health Aide (Scheduled: school hours)
                ├─► Grandparent (Always: when supervising)
                ├─► Babysitter (Event: specific dates)
                └─► Endocrinologist (Always: view + reports)
```

**Key NRG Features Used:**
- Scheduled policies with fill patterns
- Multiple group definitions per site
- Activity logging for accountability
- nsjwt for careportal access levels

---

### 1.2 Teen (Ages 13-17)

**Characteristics:**
- Emerging autonomy with parental oversight
- May want privacy from some family members
- Sports, social events create new access patterns
- Learning to self-manage while maintaining safety net

**Typical Delegation Pattern:**
```
Teen ─────────────┬─► Self (Owner: full control)
                  ├─► Parent (Always: read, careportal on request)
                  ├─► School Nurse (Scheduled: school hours only)
                  └─► Coach (Event: practice/game times)

Parent (Co-owner) ─► Emergency override capability
```

**Key NRG Features Used:**
- Multi-owner site registration (proposed)
- Emergency escalation paths
- Teen-controlled group definitions
- Parental safety net without constant visibility

---

### 1.3 Adult Independent

**Characteristics:**
- Full sovereignty over data
- May share voluntarily for social connection
- Professional relationships on their terms
- Often minimal delegation unless choosing to share

**Typical Delegation Pattern:**
```
Adult (Owner) ───┬─► Endocrinologist (Scheduled: office hours + reports)
                 ├─► Partner/Spouse (Always: read, optional alerts)
                 ├─► Social circle (Anonymous: public view)
                 └─► Automated agents (Always: Loop/AAPS)
```

**Key NRG Features Used:**
- Anonymous/public access mode for sharing
- Identity-mapped access for healthcare
- Legacy escape hatch for devices
- Activity logs for personal review

---

### 1.4 Adult with Variable Support Needs

**Characteristics:**
- Swings between sovereign independence and delegated help
- May need help during illness, stress, burnout periods
- Friends, partners, or hired help step in temporarily
- Dignity and control remain paramount even when accepting help

**Typical Delegation Pattern:**
```
Adult (Owner) ───┬─► Self (Always: full control)
                 ├─► Partner (Toggled: when requested)
                 ├─► Friend "Diabetes Buddy" (Scheduled: check-in times)
                 ├─► Professional Coach (Scheduled: appointment times)
                 └─► Emergency Contact (Emergency: escalation only)

[State: Independent]     [State: Supported]
Partner: off             Partner: read + alerts
Friend: weekly check     Friend: daily check
```

**Key NRG Features Used:**
- Dynamic policy toggles
- On-demand policy activation
- Clear boundaries with schedules
- Reversible delegation grants

---

### 1.5 Elder Care / Chronic Condition Support

**Characteristics:**
- May have diminished capacity for self-management
- Professional caregivers involved daily
- Family members coordinate remotely
- Documentation trails for insurance/medical necessity
- Dignity preservation remains essential

**Typical Delegation Pattern:**
```
Elder (Nominal Owner) ──► Limited self-access (simplified view)

POA/Guardian ────┬─► Full management rights
                 ├─► Assigns professional caregivers
                 ├─► Monitors activity logs
                 └─► Manages delegation chain

Professional Team:
  ├─► Home Health Aide (Scheduled: shift hours)
  ├─► Visiting Nurse (Scheduled: visit days)
  └─► Primary Care (Always: reports + documentation)
```

**Key NRG Features Used:**
- Owner delegation to POA/guardian
- Comprehensive activity logging
- Professional team management
- Documentation exports for compliance

---

## Dimension 2: Context Environments

Where care coordination happens affects access patterns and documentation needs.

### 2.1 Personal/Home

| Aspect | Characteristics |
|--------|-----------------|
| **Access Pattern** | 24/7 for household members |
| **Documentation** | Minimal formal requirements |
| **Actors** | Family, partners, roommates |
| **Privacy Level** | Intimate, high trust |

**Typical Configuration:**
- Mode A (Anonymous) for trusted household
- Or Mode B with always-allow policy for family group

---

### 2.2 School / Childcare

| Aspect | Characteristics |
|--------|-----------------|
| **Access Pattern** | Strict school hours; no weekend access typically |
| **Documentation** | 504 plans, health office logs |
| **Actors** | Nurse, health aide, teachers, office staff |
| **Privacy Level** | Professional, FERPA considerations |

**Typical Configuration:**
- Mode B (Identity-Mapped) with school hours schedule
- Separate groups for health office vs. classroom awareness
- nsjwt policies for treatment entry capability
- Activity logging for school records

---

### 2.3 Workplace

| Aspect | Characteristics |
|--------|-----------------|
| **Access Pattern** | Work hours; employee-controlled disclosure |
| **Documentation** | HR accommodations if disclosed |
| **Actors** | Self primarily; optional trusted colleague |
| **Privacy Level** | High privacy; selective disclosure |

**Typical Configuration:**
- Often no workplace delegation
- If shared: single trusted colleague with read-only
- Scheduled to work hours only
- Activity log review for personal awareness

---

### 2.4 Healthcare Clinical

| Aspect | Characteristics |
|--------|-----------------|
| **Access Pattern** | Appointment-based or always-on for specialists |
| **Documentation** | EMR integration, billing/reimbursement, reports |
| **Actors** | Physicians, nurses, CDEs, care coordinators |
| **Privacy Level** | HIPAA-governed, professional |

**Typical Configuration:**
- Mode B with organization or email identity matching
- Reports-focused access (not real-time surveillance)
- Documentation trail for reimbursement proof
- Provider-controlled boundaries (see Section 5.4)

---

### 2.5 Social / Community Events

| Aspect | Characteristics |
|--------|-----------------|
| **Access Pattern** | Event duration only |
| **Documentation** | None |
| **Actors** | Race volunteers, camp counselors, event staff |
| **Privacy Level** | Temporary, purpose-limited |

**Typical Configuration:**
- One-time schedule policy for event window
- Anonymous or temporary identity grants
- Automatic expiration
- Minimal permissions (read-only)

---

### 2.6 Emergency Response

| Aspect | Characteristics |
|--------|-----------------|
| **Access Pattern** | Immediate, any time |
| **Documentation** | Incident reports |
| **Actors** | EMTs, emergency contacts, hospital staff |
| **Privacy Level** | Overrides normal privacy for safety |

**Typical Configuration:**
- Emergency contact group with elevated access
- API secret for medical ID apps
- Clear current-status display
- Integration with emergency services (future)

---

## Dimension 3: Actor Relationships

Who interacts with the data and in what capacity.

### 3.1 Self (Sovereign)

The person with diabetes as data owner.

| Attribute | Value |
|-----------|-------|
| **Default State** | Full control |
| **NRG Role** | Site owner |
| **Typical Permissions** | All (unrestricted) |
| **Key Need** | Sovereignty, privacy, control |

---

### 3.2 Family / Trusted Individuals

Close relationships with ongoing involvement.

| Attribute | Value |
|-----------|-------|
| **Examples** | Parents, spouse, partner, adult children |
| **Trust Level** | High, relationship-based |
| **Typical Permissions** | Read, careportal, alerts |
| **Access Pattern** | Always-on or toggled by owner |
| **Key Need** | Participate in care, peace of mind |

---

### 3.3 Professional Caregivers

Paid or formal caregiving roles.

| Attribute | Value |
|-----------|-------|
| **Examples** | School nurse, home health aide, CDE |
| **Trust Level** | Professional, role-based |
| **Typical Permissions** | Read, treatments during shift |
| **Access Pattern** | Scheduled to work hours |
| **Key Need** | Do their job, document actions |

---

### 3.4 Healthcare Providers

Physicians and clinical staff.

| Attribute | Value |
|-----------|-------|
| **Examples** | Endocrinologist, PCP, diabetes educator |
| **Trust Level** | Professional, regulated |
| **Typical Permissions** | Read, reports, documentation |
| **Access Pattern** | Work hours OR on-demand review |
| **Key Need** | Clinical insight, documentation for billing |

**Special Considerations:**
- Providers often don't want real-time alerts outside work hours
- Need proof they received reports for reimbursement
- May review asynchronously, not in real-time
- Documentation trail more important than live access

---

### 3.5 Automated Agents

Software and devices acting autonomously.

| Attribute | Value |
|-----------|-------|
| **Examples** | Loop, AAPS, Nightscout Reporter, pumps |
| **Trust Level** | Technically verified, owner-authorized |
| **Typical Permissions** | Read + write specific APIs |
| **Access Pattern** | Always-on, machine-to-machine |
| **Key Need** | Reliable API access, clear actor tracking |

**NRG Features:**
- API secret escape hatch (Mode C)
- Actor identity tracking (ns_actor claims)
- Distinguished from human entries in logs

---

### 3.6 Transient Helpers

Temporary, situational assistance.

| Attribute | Value |
|-----------|-------|
| **Examples** | Babysitter, race volunteer, visiting friend |
| **Trust Level** | Situational, time-limited |
| **Typical Permissions** | Read-only or limited careportal |
| **Access Pattern** | Event or date-range only |
| **Key Need** | Quick setup, automatic expiration |

**NRG Features:**
- One-time schedule policies
- Temporary access links (proposed)
- Minimal identity requirements

---

## Dimension 4: Temporal Patterns

When access is permitted or expected.

### 4.1 Always-On

| Pattern | Always-On |
|---------|-----------|
| **Description** | Access available 24/7/365 |
| **Use Cases** | Family, automated agents, emergency contacts |
| **Configuration** | No schedule; base policy only |

---

### 4.2 Scheduled Recurring

| Pattern | Scheduled Recurring |
|---------|---------------------|
| **Description** | Weekly/daily repeating windows |
| **Use Cases** | School hours, work shifts, weekly check-ins |
| **Configuration** | `schedule_type: week` with segments and fill pattern |

**Example Configurations:**

| Scenario | Segments | Fill Pattern |
|----------|----------|--------------|
| School Hours (M-F 8am-3pm) | 11 segments | deny,allow,deny... |
| Weekend Only | 2 segments | deny,allow |
| Daily Morning Check (8-9am) | 14 segments | deny,allow cycling |

---

### 4.3 Event-Based

| Pattern | Event-Based |
|---------|-------------|
| **Description** | Specific date/time windows, non-recurring |
| **Use Cases** | Marathon, babysitting weekend, camp week |
| **Configuration** | `schedule_type: one-time` (proposed) |

---

### 4.4 On-Demand with Boundaries

| Pattern | On-Demand with Boundaries |
|---------|---------------------------|
| **Description** | Available when activated, within limits |
| **Use Cases** | Doctor reviews reports when convenient, friend checks in when asked |
| **Configuration** | Base policy + schedule boundary (e.g., work hours only) |

**Doctor Example:**
- Doctor can access reports *when they choose to* during work hours
- Not receiving real-time alerts
- Access logged for documentation/reimbursement proof
- No expectation of immediate response outside hours

---

### 4.5 Emergency Override

| Pattern | Emergency Override |
|---------|-------------------|
| **Description** | Bypass normal restrictions for safety |
| **Use Cases** | Severe hypo, unresponsive patient, critical alert |
| **Configuration** | Emergency group with elevated permissions (proposed) |

---

## Use Case Scenarios

Concrete examples mapping dimensions to NRG configurations.

### Scenario 5.1: Pediatric School Day

**Persona:** 8-year-old with T1D, parents managing

**Actors:**
- Mom (owner)
- School nurse
- Health aide
- Teacher (awareness only)

**Configuration:**

```
Site: timmy-cgm.example.com
require_identities: true
exempt_matching_api_secret: true (for uploader)

Group: "School Health Office"
  inclusion_specs:
    - email: nurse@lincoln-elementary.edu
    - email: healthaide@lincoln-elementary.edu
  
Policy: "School Hours Access"
  policy_type: nsjwt (careportal permissions)
  schedule: M-F 8am-3pm (allow), all other times (deny)

Group: "Classroom Awareness"
  inclusion_specs:
    - email: teacher@lincoln-elementary.edu
  
Policy: "Teacher View Only"
  policy_type: default
  policy_spec: allow
  schedule: M-F 8am-3pm (allow), all other times (deny)
  [nsjwt with readable-only token]
```

---

### Scenario 5.2: Adult Autonomy Swing

**Persona:** 35-year-old with T1D, independent but sometimes needs support

**Actors:**
- Self (owner)
- Partner
- Friend "diabetes buddy"
- Endocrinologist

**States:**

| State | Partner Access | Friend Access | Doctor Access |
|-------|----------------|---------------|---------------|
| **Independent** | Off or read-only | Weekly check-in call (no CGM) | Reports on request |
| **Supported** | Read + alerts + careportal | Daily read access | Same |
| **Crisis** | Full access | Real-time read | Notified for appointment |

**Configuration:**

```
Site: my-diabetes.example.com
require_identities: true

Group: "Partner"
  inclusion_specs:
    - email: partner@family.com

Policy: "Partner Access"
  policy_type: nsjwt
  policy_spec: [configurable - toggled by owner]
  
  [Owner toggles between:]
  - Off (policy removed or deny)
  - Read-only (readable token)
  - Full support (careportal token)

Group: "Diabetes Buddy"
  inclusion_specs:
    - email: friend@example.com

Policy: "Buddy Check-in"
  policy_type: default
  policy_spec: allow
  schedule: 
    [Independent]: Saturday 10am-11am only
    [Supported]: Daily 8am-8pm
```

---

### Scenario 5.3: Healthcare Provider Documentation

**Persona:** Endocrinologist seeing 200 patients with diabetes

**Need:**
- Access patient reports for clinical review
- Documentation that reports were received (billing/reimbursement)
- NO alerts or real-time monitoring responsibility
- NO access expectations outside work hours

**Configuration:**

```
[Each patient site configured individually by patient/owner]

Site: patient-cgm.example.com
require_identities: true

Group: "My Healthcare Team"
  inclusion_specs:
    - email: dr.smith@clinic.example.com
    - email: cde@clinic.example.com

Policy: "Provider Report Access"
  policy_type: default
  policy_spec: allow
  schedule: M-F 8am-6pm (clinic hours)
  
  [Additional configuration:]
  - Access logged with timestamp
  - Provider can pull Nightscout Reporter data during window
  - Log serves as documentation that data was received
  - No push notifications to provider
```

**Reimbursement Documentation Flow:**
1. Provider accesses patient's Nightscout during scheduled window
2. Access logged: `{subject: "dr.smith@...", timestamp: "...", action: "view"}`
3. Provider downloads/generates report via Nightscout Reporter
4. Activity log can be exported as documentation that data was received
5. Supports billing codes requiring proof of remote monitoring review

---

### Scenario 5.4: Elder Care Team Coordination

**Persona:** 78-year-old with T2D and mild cognitive decline

**Actors:**
- Elder (nominal owner, simplified access)
- Adult daughter (POA, effective manager)
- Home health aide (daily visits)
- Visiting nurse (weekly)
- Primary care physician

**Configuration:**

```
Site: mom-cgm.example.com
require_identities: true

[Ownership model:]
- Elder retains nominal ownership
- Daughter has delegated full management rights
- All policies set up by daughter

Group: "Family Manager"
  inclusion_specs:
    - email: daughter@family.com
  
Policy: "Family Full Access"
  policy_type: nsjwt (full careportal)
  schedule: always

Group: "Home Care Team"
  inclusion_specs:
    - email: aide@homecare.com
  
Policy: "Aide Shift Access"
  policy_type: nsjwt (careportal)
  schedule: M-F 9am-1pm, Sat 10am-12pm

Group: "Visiting Nurse"
  inclusion_specs:
    - email: nurse@vna.org
  
Policy: "Nurse Visit Access"
  policy_type: nsjwt (careportal + notes)
  schedule: Tuesday 2pm-4pm

Group: "Primary Care"
  inclusion_specs:
    - email: pcp@medical.example.com
  
Policy: "PCP Review Access"
  policy_type: default
  policy_spec: allow
  schedule: M-F 8am-5pm
  [Reports and documentation focus]

Activity Logging: ENABLED
  - All access tracked
  - Daughter reviews logs weekly
  - Documentation for insurance if needed
```

---

### Scenario 5.5: Marathon Public Sharing

**Persona:** Adult runner wanting to share glucose during race

**Configuration:**

```
Site: runner-marathon.example.com
require_identities: false (Mode A - public)

[Temporary override:]
- Normal state: require_identities: true (private)
- Race day: require_identities: false

Policy: "Race Day Public"
  schedule_type: one-time (proposed)
  window: April 15, 6am - April 15, 6pm
  policy_spec: allow (anonymous)
  
[After race: automatically reverts to private]
```

---

## Component Capability Matrix

Mapping use case needs to NRG building blocks.

### Access Control Components

| Component | Capability | Status | Scenarios |
|-----------|------------|--------|-----------|
| **Mode A: Anonymous** | Public access, anyone with link | ✅ Implemented | Marathon sharing, family view |
| **Mode B: Identity-Mapped** | Login required, consent logged | ✅ Implemented | School, healthcare, all professional |
| **Mode C: API Secret** | Device bypass for uploaders | ✅ Implemented | Loop, xDrip, AAPS |
| **Group Definitions** | Named collections of identities | ✅ Implemented | All multi-person scenarios |
| **Email Identity** | Match by email address | ✅ Implemented | Individual invitations |
| **Organization Identity** | Match by org claim | 🚧 Planned | Healthcare systems, schools |
| **Subject Identity** | Match by user ID | 🚧 Planned | Cross-system identity |
| **Connection Policies** | Link groups to sites | ✅ Implemented | All access grants |
| **Default Policy Type** | Allow/deny decisions | ✅ Implemented | Simple access control |
| **nsjwt Policy Type** | Nightscout permission tokens | ✅ Partial | Careportal, treatments |

### Temporal Components

| Component | Capability | Status | Scenarios |
|-----------|------------|--------|-----------|
| **Weekly Schedules** | Recurring weekly patterns | ✅ Implemented | School hours, work shifts |
| **Daily Schedules** | Daily recurring patterns | 🚧 Planned | Daily check-ins |
| **Monthly Schedules** | Monthly patterns | 🚧 Planned | Monthly reviews |
| **One-Time Windows** | Non-recurring events | 🚧 Planned | Marathons, babysitting |
| **Fill Patterns** | Segment-to-permission mapping | ✅ Implemented | All scheduled access |

### Identity & Audit Components

| Component | Capability | Status | Scenarios |
|-----------|------------|--------|-----------|
| **Consent Tracking** | Record user agreement | ✅ Implemented | All identity-mapped access |
| **joined_groups** | Materialized memberships | ✅ Implemented | Access decision efficiency |
| **Policy Change Logging** | Track policy modifications | ✅ Implemented | Audit trail |
| **Access Event Logging** | Track each access | 🚧 Planned | Billing documentation, review |
| **Actor Claims (ns_actor)** | Verified identity in tokens | 🚧 Proposed | Actor tracking, automation distinction |

### Delegation Components

| Component | Capability | Status | Scenarios |
|-----------|------------|--------|-----------|
| **Owner Management** | Single owner per site | ✅ Implemented | Standard ownership |
| **Delegated Management** | POA/guardian controls | 🚧 Proposed | Elder care, pediatric |
| **Multi-Owner Sites** | Shared ownership | 🚧 Proposed | Teen + parent, couples |
| **Emergency Escalation** | Override normal policies | 🚧 Proposed | Crisis situations |

---

## Implementation Status

### Currently Supported Scenarios

| Scenario | Support Level | Notes |
|----------|---------------|-------|
| Personal/family sharing | ✅ Full | Mode A or simple Mode B |
| School hours access | ✅ Full | Weekly schedules working |
| Babysitter weekend | ✅ Full | Schedule segments work |
| Healthcare read access | ✅ Full | Email identity + schedules |
| Device uploaders | ✅ Full | Mode C escape hatch |
| Careportal delegation | ⚠️ Partial | nsjwt exists but exchange needs work |

### Scenarios Needing Enhancement

| Scenario | Gap | Proposed Solution |
|----------|-----|-------------------|
| One-time events (marathon) | No one-time schedule type | Add `schedule_type: one-time` |
| Adult autonomy toggle | Manual policy changes | Policy activation states |
| Elder care delegation | No delegation chain model | Delegated owner management |
| Billing documentation | No access logging | Add `access_activities` table |
| Organization matching | Only email matching now | Implement organization identity type |
| Emergency override | No escalation model | Emergency group + elevated access |
| Teen co-ownership | Single owner only | Multi-owner site registration |

### Priority Roadmap for Use Cases

1. **Access Event Logging** - Enables billing documentation use case
2. **One-Time Schedules** - Enables event-based sharing
3. **Organization Identity** - Enables healthcare system integration
4. **Policy Toggle States** - Enables autonomy swing use case
5. **Delegated Ownership** - Enables elder care and pediatric management

---

## Contributing

This is a living document. When new use case patterns emerge:

1. Identify which dimensions are involved
2. Document the actor relationships and temporal patterns
3. Map to existing NRG components
4. Note any capability gaps
5. Propose enhancements if needed

Submit updates to keep this matrix aligned with community needs.

---

## Related Documentation

- [README.md](../README.md) - Example use cases overview
- [Access Modes](./access-modes.md) - Technical details of Mode A/B/C
- [Policies and Permissions](./policies-and-permissions.md) - Groups, policies, schedules
- [OIDC Actor Identity Proposal](./proposals/oidc-actor-identity-proposal.md) - Verified actor tracking
- [ROADMAP.md](./ROADMAP.md) - Planned features and enhancements
