# Open decisions

This file records the first week of checks that must be completed before product features.

## Open spikes

- [ ] Confirm Entra External ID app roles and the `companyId` claim; compare the guest-user fallback.
- [ ] Confirm `Sites.Selected` permits the single data site and denies other sites.
- [ ] Confirm the Graph Excel API changes a named cell without breaking array formulas.
- [ ] Measure the 3,136-row shipment read and behaviour while Excel has the file locked.

## Business specification

The following rules are the recommended starting model for Freight Desk. Items
marked as customer approval required must be confirmed before the related
feature is released. The existing decisions above remain in force.

### Resolved for the initial model

- `submitted` is an offer state, not a tender state. Tender statuses are
  `draft`, `open`, `closed`, `awarded` and `archived`.
- A submitted offer is an immutable bid version. A later submission creates a
  new version and marks the previous one `superseded`.
- All stored timestamps and deadline comparisons use UTC. Customer-local time
  is display-only and uses the tender's IANA time zone.
- Prices use integer minor currency units and always carry a currency code.
- The first data model supports kg, pallets, CBM, LDM and packages.
- SharePoint Excel and JSON files are the intended first source of truth. The
  current application has not yet implemented the SharePoint adapter. A
  PostgreSQL foundation migration may hold only account, organisation and
  authorisation metadata; it must not become a freight-data store.
- Canonical validation schemas live in `packages/shared/src/schemas`; the
  public TypeScript model exports live in `packages/shared/src/types`.

### Unresolved decisions and recommended defaults

| Decision requiring customer approval | Recommended default |
| --- | --- |
| Markets and postcode formats beyond the initial two-digit prefix rule | Start with two-digit prefixes `00` to `99`; add country-specific rules later |
| Whether overlapping zone ranges are ever valid | Reject overlaps; require an explicit approved priority policy for exceptions |
| Default VAT treatment and applicable rates | Store rates excluding VAT and keep VAT treatment/rate separate |
| Fuel surcharge calculation base | Percentage of the base transport price, shown separately |
| Whether partial carrier coverage may be submitted | Allow submission, but exclude uncovered shipments from the eligible total and flag them |
| Service-quality measurements and minimum threshold | Use only agreed measurable data; do not invent a score from free text |
| Default evaluation mode | Cheapest eligible offer, with service quality, transit time and coverage shown separately |
| Weighted evaluation weights | Enable only when the tender defines weights totaling 10,000 basis points |
| Tie-breaking order | Price, maximum transit time, quality, submission time, then logged manual decision |
| Zero-valued rates | Allow explicit zero with a confirmation warning; never treat missing as zero |
| Offer withdrawal | Allow before the deadline; prohibit after closure |
| Reopening a closed tender | Do not allow by default; require master action and customer approval |
| One or multiple carriers can be awarded | One carrier per tender by default |
| Template required columns and formula ownership | Keep approved, versioned templates; change only after customer approval |
| Retention and archive period | Archive instead of deleting; confirm the required legal/business retention period |

### Next validation work

- Confirm the customer-approved rows in the table above.
- Compare the model against anonymized shipment, carrier-rate and award
  workbooks.
- Record the results of the Entra, Sites.Selected, Excel API and SharePoint
