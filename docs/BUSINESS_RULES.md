# Freight Desk business rules

This document defines the first business specification for Freight Desk. It is
written before screens and APIs so that the same rules can be implemented and
tested in every part of the product.

## Approval language

- **Recommended default** means the safest starting rule when the customer has
  not yet decided.
- **Customer approval required** means the rule must be confirmed by the
  consultancy before it becomes production behavior.
- Fictional examples use names such as Northwind Haulage and Blue Fjord
  Transport. They are not customer data.

## People and ownership

| Role | Person | Owns or controls | Cannot do |
| --- | --- | --- | --- |
| `carrier` | A transport company's user | That company's memberships and offers | See another carrier's data or create tenders |
| `consultant` | A logistics consultancy employee | Tenders, invitations, comparisons and exports | Read sealed offers before the deadline |
| `master` | A very limited consultancy owner group | All consultant actions, companies, memberships, unsealing and audit review | Bypass the audit trail |

There are no product passwords. Identity, MFA and role assignment come from
Microsoft Entra. A carrier membership contains the carrier company ID used for
every authorization check.

## Tender lifecycle

`submitted` is not a tender status. It is an offer status. A tender remains
`open` while carriers can work on their offers.

| Status | Meaning | Allowed transition | Who can change it |
| --- | --- | --- | --- |
| `draft` | Being prepared; invitations have not made it active | `open` or remain `draft` | Consultant; master |
| `open` | Published to invited carriers until the UTC deadline | `closed` | Consultant; scheduled deadline job; master |
| `closed` | No new offer submission or edit is accepted | `awarded` or `archived` | Consultant; master |
| `awarded` | At least one eligible offer has been selected | `archived` | Consultant; master |
| `archived` | Read-only historical record | None | Master may restore only through an approved process |

Recommended default: a consultant may close an open tender early, but the
action must be confirmed and audited. Reopening a closed tender requires
customer approval; the default is not to reopen it.

An open tender has one server-enforced deadline. At the exact deadline instant,
the tender is closed and a submission is rejected. The server compares UTC
timestamps, not the user's computer clock.

## Offer lifecycle

An offer is represented by immutable versions. A carrier may edit its current
draft, but a submitted version is never changed in place.

| State | Meaning | Editable | Visibility |
| --- | --- | --- | --- |
| `draft` | Work in progress for one carrier and tender | Carrier members of that company | Carrier sees its own draft; consultants see only that an offer is not submitted |
| `submitted` | Valid offer submitted before the deadline | No | Sealed from consultants until the deadline |
| `superseded` | An older submitted version replaced by a later submission | No | Carrier and authorized consultancy users after unsealing |
| `withdrawn` | The carrier removed the offer from consideration | No | Carrier and authorized consultancy users after unsealing |

Every submission creates a new version number. The previous submitted version
becomes `superseded`; its file, values and timestamp remain available for audit.
Recommended default: a carrier may withdraw before the deadline, but cannot
withdraw after the tender closes. Customer approval is required for a different
rule.

## Resource permissions

| Resource | Owner | Carrier visibility | Consultant visibility | Master-only action |
| --- | --- | --- | --- | --- |
| Tender | Consultancy | Only if invited, while relevant to that carrier | All tenders in their working scope | Archive, reopen, manage ownership |
| Carrier company | The carrier company | Own company only | Companies participating in their work | Create, suspend, merge or assign users |
| User membership | Its company or consultancy | Own company membership only | No carrier membership administration by default | Add, suspend or change membership |
| Invitation | Tender owner | Own company's invitations | Invitations for owned or assigned tenders | Override or revoke an invitation |
| Shipment | Tender owner | Only the shipment data needed to price an invited tender | All shipments in their tender scope | Restore archived data |
| Postcode zone | Tender owner | Only zones needed for the carrier's offer | All zones in their tender scope | Change policy after offers exist |
| Rate band and surcharge | Carrier company for its offer | Own draft and submitted versions | Sealed until the deadline, then comparison access | Unseal before deadline |
| Bid version | Carrier company for its offer | Own versions | Only after deadline or master unseal | Unseal or restore an archived version |
| Award | Consultancy | Only the result relevant to that carrier | All awards in their tender scope | Confirm exceptional changes and archive |
| Excel template | Consultancy | Only when an invitation requires an upload | Approved templates | Approve, retire or replace a version |

Every read and write is checked against the signed-in role, company ID, tender
membership and resource state. A missing role or company ID is denied.

### State-specific edit rules

| Resource state | Carrier | Consultant | Master |
| --- | --- | --- | --- |
| Tender `draft` | No access unless explicitly invited for preparation | Create and edit | Create and edit |
| Tender `open` | Read invited tender only | Edit tender data, invite carriers and close | Same, plus exceptional override |
| Tender `closed` | Read only if invited | Compare and prepare award; no shipment or zone edits | Same, plus logged restore decision |
| Tender `awarded` | Read the published result relevant to that carrier | Read, export and record follow-up | Read, export and archive |
| Tender `archived` | No access by default | Read only | Read, restore through an approved process |
| Offer `draft` | Edit own current draft | Cannot inspect values | Cannot edit; may intervene only through a logged action |
| Offer `submitted` | Cannot edit; may withdraw before deadline | Cannot open while sealed | May unseal before deadline with reason |
| Offer `superseded` or `withdrawn` | Read own immutable history | Read after close or unseal | Read and audit |
| Shipment or zone version | No edit | Edit only while tender is draft/open | Edit only through a logged exceptional action |
| Award `confirmed` | Read relevant result | Read and export | Read, cancel only with reason |

The server, not a screen, enforces these rules. A denied read must not reveal
whether another carrier's resource exists.

## Shipment and pricing data

Supported shipment quantity units are `kg`, `pallets`, `CBM`, `LDM` and
`packages`. A shipment may contain more than one quantity, for example a
fictional shipment with 2 pallets, 1.2 LDM and 480 kg.

Prices are stored as integer minor currency units and always carry a three-letter
currency code. The system never silently mixes currencies. Exchange rates, when
needed, are stored with the tender so historical results do not change later.

Each tender declares its VAT treatment. The supported treatments are:

- VAT included in the offered amount.
- VAT excluded from the offered amount.
- Zero-rated.
- Reverse charge.
- Not applicable.

Customer approval is required for the default VAT treatment and the applicable
VAT rate. Recommended default: store the carrier's commercial rate excluding
VAT, store the VAT treatment separately, and show both net and gross totals only
when the rate is known.

Fuel surcharges may be a percentage of the agreed base price or a fixed amount
per shipment. Additional fees have a name, amount, currency, VAT treatment and
scope such as shipment, pallet or package. An offer must show the base price,
fuel surcharge and additional fees separately before showing the total.

Delivery time is expressed as minimum and maximum business days, when supplied
by the carrier. Service coverage lists the countries and tender zones covered by
the offer. A carrier may explain a limitation, but text cannot make an uncovered
zone eligible.

## Postcode zones

The initial Danish-style rule uses two-digit postcode prefixes from `00` to
`99`. The prefix boundary is inclusive: a range `26` to `29` includes `2600`
through `2999` for matching purposes.

- A range must have `from <= to`.
- A zone may contain several non-contiguous ranges.
- Gaps are allowed in the zone map, but a shipment matching a gap is reported as
  unmatched and is never priced as zero.
- Overlaps are rejected by default because they make a price ambiguous.
- A tender may use an explicit priority policy only after customer approval.
  Under that policy, the lowest numeric priority wins; equal-priority overlaps
  remain invalid.
- A zone-map change creates a new tender data version and is not allowed to
  silently alter an already awarded result.

Example: Northwind Haulage maps prefixes `00-26` to Zone A and `30-36` to Zone
B. A shipment to `2700` has no zone and must be fixed before it can be fully
evaluated.

## Eligibility and evaluation

An offer is eligible for a shipment only when it has a valid price, matching
unit and currency, applicable surcharge rules, service coverage and a resolved
zone. No price is inferred from another zone or from a missing cell.

The evaluation supports:

1. Cheapest eligible offer.
2. Service quality, using agreed measurable data.
3. Transit time.
4. A configurable weighted score whose weights total 10,000 basis points.

Recommended default: use cheapest eligible offer as the primary result and show
service quality, transit time and coverage as separate comparison columns. A
weighted score is enabled only when the tender explicitly defines its weights.
The data source and minimum quality threshold for service quality require
customer approval.

Recommended tie-break order:

1. Lower eligible total price.
2. Shorter maximum transit time.
3. Higher service-quality score.
4. Earlier valid submission.
5. Manual consultant decision with a required reason.

Customer approval is required for a different tie-break order and for whether a
tender can award multiple carriers. The recommended default is one award per
tender.

Missing prices make the affected shipment ineligible for that offer. An
incomplete zone map may still be submitted as a draft or offer, but its uncovered
shipments are excluded from the eligible total and visibly flagged. A zero-valued
rate is allowed only when explicitly entered by the carrier; it is never a
replacement for a missing value and must produce a confirmation warning.

## Excel templates and versions

There are three versioned template families:

- **Shipment template**: consultancy shipment rows and normalized input fields.
- **Carrier-rate template**: carrier zones, rate bands, surcharges, delivery
  times and coverage.
- **Award template**: the selected result and the calculation breakdown.

Each template has a family, semantic version, approved status, checksum and
creation time. A tender records the exact template versions used. Imports are
validated before data is saved, and the original uploaded file is retained.
Exports use the approved award template and never overwrite the original source
workbook. Template approval, required columns and whether formulas may be
changed require customer approval.

## Time, audit and retention

All stored timestamps and deadline comparisons use UTC ISO timestamps. The
customer's configured IANA time zone is used for display, for example
`Europe/Copenhagen`. The displayed local time must include the time zone or a
clear offset so that daylight-saving changes are not ambiguous.

Important actions are appended to the audit log: login, denied access, tender
creation or closure, invitation, offer submission or withdrawal, unsealing,
award, export and membership changes. Logs contain IDs and event names, not
prices, shipment contents, tokens or personal data.

Data is archived rather than deleted. Submitted offer versions and awarded
results remain immutable.
