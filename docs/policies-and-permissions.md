# Policies and Permissions

This document explains how NRG manages access control through groups, policies, and schedules. It covers the full lifecycle from defining who can access a site to how access decisions are made at runtime.

## Overview

NRG's permission system has four main components:

| Component | Purpose |
|-----------|---------|
| **Groups (Roles)** | Define collections of identities (people) |
| **Connection Policies** | Link groups to sites with permission types |
| **Scheduled Policies** | Add time-based rules to policies |
| **Joined Groups** | Track which users have accepted invites and consented |

The flow works like this:

```
Owner creates Group → Adds inclusion specs (emails) → Creates Connection Policy → Optionally adds Schedule
                                                              ↓
Visitor receives invite → Logs in → Consents → joined_groups record created
                                                              ↓
On access request: Warden evaluates unified_active_site_policies → Allow/Deny decision
```

## Groups (Roles)

Groups define collections of identities that can be granted access to a site. In the database, groups are stored in `group_definitions` and their membership rules in `group_inclusion_specs`.

### Group Definition

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `owner_ref` | The owner who created this group |
| `nickname` | Human-readable name (e.g., "School Nurses") |
| `synopsis` | Brief description |
| `deny_access` | If true, group is used to deny rather than allow |

### Inclusion Specs

Each group has one or more inclusion specs that define who belongs to the group.

| Field | Description |
|-------|-------------|
| `group_definition_id` | The group this spec belongs to |
| `identity_type` | Type of identity matching |
| `identity_spec` | The value to match |
| `nickname` | Optional label for this rule |

### Identity Types

| Type | Matching Behavior | Example `identity_spec` |
|------|-------------------|------------------------|
| `email` | Exact match after lowercase normalization | `nurse@school.edu` |
| `anonymous` | Matches any visitor (or specific audience keyword) | `public` |

**Email normalization**: Emails are trimmed and lowercased before comparison. `Nurse@School.EDU` matches `nurse@school.edu`.

**Note**: Other identity types (`organization`, `subject`) are defined in the schema but not currently implemented in the matching logic.

### Example: Creating a Group for School Staff

```
Group Definition:
  nickname: "School Health Office"
  owner_ref: "owner_abc123"

Inclusion Specs:
  - identity_type: "email", identity_spec: "nurse@lincoln-elementary.edu"
  - identity_type: "email", identity_spec: "health.aide@lincoln-elementary.edu"
```

## Connection Policies

Connection policies link a group to a site and specify what kind of access to grant.

### Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `site_id` | The registered site this policy applies to |
| `group_definition_id` | The group being granted access |
| `policy_name` | Human-readable name |
| `policy_type` | Type of permission (see below) |
| `policy_spec` | The permission value (`allow`, `deny`) |
| `sort` | Order for policy evaluation |

### Policy Types

| Type | Behavior |
|------|----------|
| `default` | Standard allow/deny. `policy_spec` is `allow` or `deny`. |
| `nsjwt` | Exchange authorization with Nightscout. Injects Nightscout's shiro/JWT into request headers alongside user identity. Used when the upstream Nightscout needs to know about specific permission levels. |

### How `nsjwt` Works

When a policy has `policy_type: nsjwt`:

1. NRG exchanges an authorization request with the upstream Nightscout
2. Nightscout returns a JWT with shiro permissions
3. NRG injects this JWT into the proxied request headers
4. The visitor's identity is also passed to Nightscout
5. Nightscout can then enforce fine-grained permissions (careportal, treatments, etc.)

This enables Nightscout's native role-based access while NRG handles the identity and scheduling layer.

## Scheduled Policies

Schedules allow permissions to vary based on time of day and day of week. This is useful for:

- School nurse access during school hours only
- Babysitter access for specific weekends
- Agent-scheduled access from calendar events ("this Tuesday 3-8pm")

### Fields

| Field | Description |
|-------|-------------|
| `policy_id` | The connection policy this schedule modifies |
| `schedule_nickname` | Human-readable name (e.g., "School Hours") |
| `schedule_type` | Type of schedule, defaults to `week` |
| `fill_pattern` | Comma-separated permission specs |
| `schedule_segments` | Comma-separated offsets in seconds since start of week |

### How Schedules Work

The week is divided into segments by offset values. Each segment is assigned a permission from the fill pattern.

**The week anchor**: Offset 0 = Sunday 00:00:00 (midnight Saturday/Sunday). The SQL calculates this as `date_trunc('week', now() + interval '1 day') - interval '1 day'` to adjust PostgreSQL's Monday-based week start.

**Offset calculation**: `offset = (day_of_week * 86400) + (hour * 3600) + (minute * 60) + second`

Where `day_of_week` is 0-6 (Sunday=0).

**Terminal segment**: The last segment extends to `604801` seconds (1 week + 1 second) by default if no explicit terminal offset is provided.

### Important: Fill Pattern Matching Rules

The SQL view `site_policy_schedules` uses modular arithmetic to assign fill patterns to segments:

```sql
fill_idx.fill_num = (slices.num % (fill_idx.total + 1))
```

Where:
- `fill_num` is 1-indexed (first pattern entry = 1, second = 2, etc.)
- `total` is the number of entries in `fill_pattern`

**This means the number of segments should equal the number of fill pattern entries for predictable behavior.** If you have more segments than fill pattern entries, patterns cycle but every `(total+1)`th segment may be dropped due to the modulo calculation producing 0 (which has no matching `fill_num`).

**Best practice**: Match the number of `fill_pattern` entries to the number of segments, or repeat pattern entries to avoid gaps.

### Example: Weekend Babysitter Access (2 segments, 2 patterns)

Goal: Allow access Saturday and Sunday only.

**Calculate offsets:**

| Boundary | Calculation | Offset (seconds) |
|----------|-------------|------------------|
| Start of week (Sunday) | 0 | 0 |
| Saturday 12:00 AM | 6 * 86400 | 518400 |

**Schedule definition:**

```
schedule_segments: "0,518400"
fill_pattern: "deny,allow"
```

**How it works:**
- Segment 1 (0 to 518400): `fill_num=1` → deny (Sunday through Friday)
- Segment 2 (518400 to week end): `fill_num=2` → allow (Saturday and Sunday)

With 2 segments and 2 fill entries, the modulo works cleanly: `1 % 3 = 1`, `2 % 3 = 2`.

### Example: Ad-Hoc Calendar Event (3 segments, 3 patterns)

Goal: Allow access this Tuesday from 3pm to 8pm.

**Calculate offsets:**

| Boundary | Calculation | Offset (seconds) |
|----------|-------------|------------------|
| Start of week | 0 | 0 |
| Tuesday 3:00 PM | 2 * 86400 + 15 * 3600 | 226800 |
| Tuesday 8:00 PM | 2 * 86400 + 20 * 3600 | 244800 |

**Schedule definition:**

```
schedule_segments: "0,226800,244800"
fill_pattern: "deny,allow,deny"
```

**How it works:**
- Segment 1 (0 to 226800): `fill_num=1` → deny (before Tuesday 3pm)
- Segment 2 (226800 to 244800): `fill_num=2` → allow (Tuesday 3pm to 8pm)
- Segment 3 (244800 to week end): `fill_num=3` → deny (after Tuesday 8pm)

### Example: School Hours (Repeating Pattern)

Goal: Allow access Monday through Friday, 8:00 AM to 3:00 PM. Deny all other times.

This requires 11 segments (deny-allow alternating for 5 days, plus initial weekend deny). To make the modulo work correctly, use 11 fill pattern entries:

**Calculate offsets:**

| Segment | Boundary | Offset |
|---------|----------|--------|
| 1 | Start of week | 0 |
| 2 | Monday 8:00 AM | 115200 |
| 3 | Monday 3:00 PM | 140400 |
| 4 | Tuesday 8:00 AM | 201600 |
| 5 | Tuesday 3:00 PM | 226800 |
| 6 | Wednesday 8:00 AM | 288000 |
| 7 | Wednesday 3:00 PM | 313200 |
| 8 | Thursday 8:00 AM | 374400 |
| 9 | Thursday 3:00 PM | 399600 |
| 10 | Friday 8:00 AM | 460800 |
| 11 | Friday 3:00 PM | 486000 |

**Schedule definition:**

```
schedule_segments: "0,115200,140400,201600,226800,288000,313200,374400,399600,460800,486000"
fill_pattern: "deny,allow,deny,allow,deny,allow,deny,allow,deny,allow,deny"
```

Each segment gets its explicit permission. This is verbose but avoids modulo edge cases.

**Alternative (if SQL is fixed)**: A future fix to use `((slices.num - 1) % total) + 1` would allow simple alternating patterns like `"deny,allow"` to work with any number of segments.

### Schedule Processing in SQL

The `site_policy_schedules` view processes schedules:

1. Parses `schedule_segments` into integer array via `string_to_array`
2. Parses `fill_pattern` into spec array via `string_to_array`
3. Numbers each fill entry (`fill_num` 1 to N) and counts total entries
4. Creates segment ranges using `lead()` window function (start = current slice, end = next slice or 604801)
5. Joins segments to fill patterns via `fill_num = (segment_num % (total + 1))`

The `site_policy_schedules_active` view filters to only segments containing the current time by comparing `seconds_since_anchor` to segment start/end bounds.

## The Consent and Join Flow

When identity-mapped access is enabled, visitors must consent before accessing a site. This creates a binding in the `joined_groups` table.

### Flow

1. **Invite**: Owner adds visitor's email to a group's inclusion specs
2. **Visit**: Visitor attempts to access the site at its vanity URL
3. **Redirect**: Visitor is redirected to login (Kratos/Hydra OAuth)
4. **Consent**: Visitor is shown a consent screen explaining that their identity will be visible to the site owner
5. **Accept**: On consent, a `joined_groups` record is created
6. **Access**: Subsequent requests include the visitor's subject ID, which is matched against `joined_groups`

### joined_groups Table

| Field | Description |
|-------|-------------|
| `subject` | The visitor's identity (user ID from Kratos) |
| `expected_name` | The site's vanity name |
| `group_id` | The group they joined |
| `group_spec_id` | The specific inclusion spec that matched |
| `policy_id` | The connection policy granting access |

This table materializes group membership after consent, enabling efficient lookups during access decisions.

## ACL Resolution

At runtime, the Warden endpoints evaluate access through a chain of SQL views that compose the final decision.

### View Hierarchy

```
registered_sites
       ↓
connection_policies ← group_definitions ← group_inclusion_specs
       ↓
scheduled_policies
       ↓
site_acls (joined view)
       ↓
site_policy_overview
       ↓
site_policy_schedules → site_policy_schedules_active
       ↓
unified_active_site_policies ← joined_groups
```

### Key Views

| View | Purpose |
|------|---------|
| `site_acls` | Joins sites, policies, groups, inclusion specs, and schedules |
| `site_policy_overview` | Flattened view of all policy assignments |
| `site_policy_schedules` | Expands schedule segments with fill pattern mapping |
| `site_policy_schedules_active` | Filters to currently active schedule segments |
| `unified_active_site_policies` | Final view: uses `COALESCE(schedule.spec, base.policy_spec)` to apply schedule overrides |

### Decision Logic

The `decision()` function in `lib/policies/index.js` evaluates:

1. **Site enabled?** → If not, 403 immediately
2. **Strictly Nightscout mode?** → Also check authenticity (BYOD validation)
3. **API secret escape hatch?** → If valid API-SECRET header matches, allow (Mode C)
4. **Require identities?** → If no, allow anonymous (Mode A)
5. **Check ACL** → Look up `unified_active_site_policies` for user's policy
6. **Policy spec?** → `allow` = access granted, `deny` = 403
7. **nsjwt mode?** → Exchange with Nightscout and inject token

## Database Tables Summary

| Table | Purpose |
|-------|---------|
| `group_definitions` | Group metadata (name, owner, deny flag) |
| `group_inclusion_specs` | Identity matching rules for groups |
| `connection_policies` | Links groups to sites with permission types |
| `scheduled_policies` | Time-based policy modifications |
| `joined_groups` | Materialized group memberships after consent |
| `registered_sites` | Site configuration including `require_identities`, `exempt_matching_api_secret` |

## Code Locations

| Component | File |
|-----------|------|
| Policy decision logic | `lib/policies/index.js` |
| Group inclusion handling | `lib/owner/index.js`, `lib/privy/index.js` |
| Registration flow | `lib/registrations/index.js` |
| Warden routes | `lib/routes.js` |
| Schedule SQL views | `migrations/20220516185528_create_schedule_arrays.js` |
| ACL views | `migrations/20220507200950_site_acl_view.js` |
| Unified active policies | `migrations/20220517164328_active_acls.js` |

## Related Documentation

- [Access Modes](./access-modes.md) - Overview of the three orthogonal access conditions
- [Criteria System](./criteria-system.md) - BYOD validation pipeline
