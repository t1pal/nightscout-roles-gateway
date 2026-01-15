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
| *Camp coordination* | Diabetes Camp Week | 5.6 |
| *Elder care integration* | Nursing Home CGM | 5.7 |

---

## Introduction

Diabetes data rights exist on a spectrum—from complete personal sovereignty to fully delegated care coordination. This document provides a structured framework for understanding the diverse use cases that NRG must support, organized across four key dimensions:

1. **Care Lifecycle Stage** - Age and autonomy considerations
2. **Context Environment** - Where care coordination happens
3. **Actor Relationships** - Who is involved and in what capacity
4. **Temporal Patterns** - When access is needed

Each dimension intersects to create specific scenarios that require different configurations of NRG's access control capabilities.

### The Adoption Gap: Pediatric Success vs. Elder Care Potential

Technology adoption in diabetes data sharing varies dramatically across the lifecycle:

**High Adoption: Pediatric & Camp Settings**
- Diabetes summer camps report campers as young as six years old arriving with smartphones and CGMs
- Parents optimistically uploading data to camp view dashboards
- Established workflows, volunteer training, and dashboard infrastructure
- Decades of community experience in coordinated care

**Low Adoption: Elder Care & Professional Managed Care**
- Few nursing homes or assisted living facilities integrate CGM data into managed care
- Professional caregivers rarely have streamlined access to residents' glucose data
- Workflow friction prevents adoption even when technology exists
- People with diabetes are aging longer thanks to technology—but care systems haven't kept pace

**Why This Matters for NRG:**

Professional enablement features—like policy templates, bulk invitations, and streamlined onboarding—can unlock CGM monitoring in underserved settings. The goal isn't to shift power away from the person with diabetes, but to reduce friction so professional caregivers *actually use* the data. When a nursing home can efficiently integrate CGM visibility into their care workflow, the resident benefits from informed, responsive care.

The camp model shows what's possible. NRG should enable similar adoption in elder care, workplace health programs, and clinical settings—always with the person with diabetes (or their designated advocate) retaining control over who gets access.

---

## Table of Contents

1. [Dimension 1: Care Lifecycle Stages](#dimension-1-care-lifecycle-stages)
2. [Dimension 2: Context Environments](#dimension-2-context-environments)
3. [Dimension 3: Actor Relationships](#dimension-3-actor-relationships)
4. [Dimension 4: Temporal Patterns](#dimension-4-temporal-patterns)
5. [Use Case Scenarios](#use-case-scenarios)
6. [Component Capability Matrix](#component-capability-matrix)
   - [Owner Convenience Components](#owner-convenience-components)
   - [Professional Enablement Components](#professional-enablement-components)
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

### Scenario 5.6: Diabetes Camp Week

**Persona:** Camp nurse managing 40 campers with T1D for one week

**Context:** High-adoption setting with established workflows. Campers arrive with CGMs uploading to camp dashboard. Parents expect coordinated care.

**Actors:**
- Campers (ages 6-17, varying autonomy)
- Parents (owners, granting access for camp week)
- Camp nurse (primary medical oversight)
- Cabin counselors (awareness, basic response)
- Camp director (administrative oversight)

**Configuration (Bulk Invitation Flow):**

```
[Camp Setup - Before Camp Week]

Camp Nurse:
  1. Creates camp session: "Camp Wellness July 15-22"
  2. Defines access template:
     - Schedule: July 15 8am - July 22 6pm
     - Permissions: Medical staff = careportal, Counselors = read-only
  3. Sends bulk invitation to registered families

Each Parent (Owner):
  1. Receives: "Camp Wellness requests access for [child] July 15-22"
  2. Reviews permissions and schedule
  3. Approves → consent recorded
  4. Child's site added to camp dashboard

[During Camp Week]

Camp Dashboard shows:
  - All consenting campers in one view
  - Color-coded by glucose status
  - Click-through to individual Nightscout
  
Medical Staff:
  - Full careportal access during camp hours
  - Can log treatments, notes
  - Activity logged per camper

Counselors:
  - Read-only view of assigned cabin
  - Alerts for urgent lows
  - No treatment entry capability

[After Camp]

  - Access automatically expires July 22 6pm
  - Parents receive summary of access activity
  - No ongoing access retained
```

**Key Features Used:**
- Bulk invitations (proposed)
- One-time schedule windows (proposed)
- Policy templates (proposed)
- Professional dashboards (proposed)
- Activity logging

**Why This Works:**
- Parents retain control: each approves individually
- Camp gets efficiency: one setup process, aggregated view
- Automatic expiration: no lingering access after camp
- Audit trail: parents can review what happened

---

### Scenario 5.7: Nursing Home CGM Integration

**Persona:** Nursing home with 8 residents using CGM (of 50 total residents)

**Context:** Low-adoption setting. Staff unfamiliar with CGM. Family members want visibility. This is an *aspirational* scenario showing what professional enablement could unlock.

**Actors:**
- Residents (nominal owners, varying cognitive capacity)
- Family members (POA/guardians, effective decision-makers)
- Nursing staff (shift-based care)
- Facility medical director
- Primary care physicians (external)

**Current State (Without NRG Professional Features):**
- Each family independently configures access
- No consistent setup across residents
- Staff must check 8 different apps/sites
- No aggregated view for shift handoffs
- Low adoption due to workflow friction

**Aspirational State (With Professional Enablement):**

```
[Facility Onboarding]

Facility Medical Director:
  1. Creates facility profile in NRG
  2. Defines standard access template:
     - Nursing staff: read + basic careportal during shifts
     - Medical director: always-on oversight
     - External physicians: scheduled to their office hours
  3. Invites families to opt in

Each Family (POA/Guardian):
  1. Receives: "Sunrise Care requests CGM integration for [resident]"
  2. Reviews: "Nursing staff will have view access during shifts (7am-7pm)"
  3. Approves (or customizes schedule)
  4. Resident's data visible on facility dashboard

[Daily Operations]

Nursing Station Dashboard:
  - Consenting residents in unified view
  - Shift handoff includes glucose trends
  - Alerts route to on-duty nurse
  
Shift Nurse:
  - Sees residents assigned to their wing
  - Can log meal acknowledgments, snack given
  - Activity logged for family review

Family Member:
  - Receives weekly summary of access activity
  - Can revoke or modify access any time
  - Retains full control as POA

[Benefit to Resident]

  - Staff aware of glucose trends before meals
  - Faster response to lows during night shifts
  - Better coordination with external physicians
  - Family has peace of mind with visibility
```

**Key Features Needed:**
- Bulk invitations with family consent
- Organization identity (facility staff group)
- Professional dashboards (aggregated view)
- Shift-based scheduling
- Activity logging for family oversight
- Delegated ownership (POA as effective manager)

**Why This Matters:**

Elder care is underserved not because the technology doesn't exist, but because workflow friction prevents adoption. Professional enablement features—designed with patient consent at the center—can unlock CGM monitoring for a population that increasingly needs it.

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

### Owner Convenience Components

These features help site owners efficiently configure access while maintaining full control.

| Component | Capability | Status | Scenarios |
|-----------|------------|--------|-----------|
| **Policy Templates** | Pre-defined policy+schedule combinations owners can apply | 🚧 Proposed | "School Hours", "Weekend Babysitter", "Healthcare Provider" |
| **Inclusion Templates** | Common identity patterns owners can import | 🚧 Proposed | "My Endocrinology Clinic", "Lincoln Elementary Health Office" |
| **Quick-Apply Wizards** | Guided setup for common scenarios | 🚧 Proposed | First-time school setup, adding family member |

**How Templates Work (Patient-Centric Model):**

Templates are *convenience tools for owners*, not institution-controlled policies. The flow remains:

1. Owner decides to grant access to a professional (school, clinic, camp)
2. Owner selects a template that matches the scenario ("School Hours Access")
3. Template pre-fills schedule, permission level, and suggested group structure
4. Owner reviews, customizes if needed, and confirms
5. Owner sends invitation; professional accepts with consent

The professional never defines a policy that spans multiple patient sites. Instead, each owner independently applies a template—ensuring consistent setup without sacrificing control.

### Professional Enablement Components

These features reduce friction for professional caregivers while preserving owner consent.

| Component | Capability | Status | Scenarios |
|-----------|------------|--------|-----------|
| **Bulk Invitations** | Professional sends one invitation request to multiple owners | 🚧 Proposed | Camp nurse onboarding 30 campers, clinic adding patients |
| **Organization Identity** | Match by verified org membership | 🚧 Planned | "Anyone from Lincoln Elementary Health Office" |
| **Professional Dashboards** | Aggregate view for consented sites | 🚧 Proposed | Camp dashboard, clinic patient list |
| **Onboarding Workflows** | Streamlined setup for common professional contexts | 🚧 Proposed | Camp registration, clinic enrollment |

**Bulk Management with Owner Consent:**

Professional bulk management is about *efficiency*, not *control*. The pattern:

```
Professional (e.g., Camp Nurse):
  1. Creates invitation request for camp week
  2. Specifies: dates, permission level, schedule
  3. Sends bulk invitation to registered camper families

Each Owner (Parent):
  1. Receives invitation: "Camp Wellness requests view access July 15-22"
  2. Reviews terms, schedule, and permissions
  3. Approves (or customizes, or declines)
  4. Consent recorded; access granted for approved window

Result:
  - Nurse has aggregated dashboard of consenting campers
  - Each owner explicitly approved their child's inclusion
  - Access automatically expires at camp end
  - Activity logged for accountability
```

This model scales to elder care facilities, school health offices, and clinical practices—enabling professional adoption while maintaining the patient-centric consent model.

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
| Camp/event coordination | Repetitive manual setup | Policy templates + bulk invitations |
| Professional dashboards | No aggregated multi-site view | Professional enablement layer |
| Elder care adoption | Workflow friction | Onboarding workflows + organization identity |

### Priority Roadmap for Use Cases

1. **Access Event Logging** - Enables billing documentation use case
2. **One-Time Schedules** - Enables event-based sharing (marathon, camp week)
3. **Policy Templates** - Reduces friction for common scenarios (school, camp, clinic)
4. **Organization Identity** - Enables healthcare system and facility integration
5. **Bulk Invitations** - Enables camp and elder care professional adoption
6. **Policy Toggle States** - Enables autonomy swing use case
7. **Delegated Ownership** - Enables elder care and pediatric management
8. **Professional Dashboards** - Aggregated view for consented sites (camp, facility)

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
