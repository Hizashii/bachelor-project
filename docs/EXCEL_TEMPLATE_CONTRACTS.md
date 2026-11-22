# Excel template contracts

Status: inspected from the two workbooks present in the repository on 2026-11-22. Both mappings remain **unverified** pending S&A review. This document records source structure; it does not approve commercial rules.

## Source control and handling

The original workbooks are preserved unchanged. No macros or unknown formulas were executed, and no recalculation was performed. The registry contains a blank-input contract only: commercial input values are represented as `null` and business rows are `0`.

| Registry ID | Purpose determined from source | Source file | SHA-256 | Immutable reference |
| --- | --- | --- | --- | --- |
| `customer-bidding` v1.0.0 | Multi-sheet 2027+2028 bid/rate aggregation workbook. It is not shipment history. | `database/excel/bidding.xlsx` | `A4A0E03EA5F403BD45E35661CC0829FC5AC6197AF6A72BFBDFA538C275BBF37D` | `repo://database/excel/bidding.xlsx?sha256=A4A0E03EA5F403BD45E35661CC0829FC5AC6197AF6A72BFBDFA538C275BBF37D` |
| `express-price` v1.0.0 | Carrier-facing express/economy parcel price and cost input workbook with a protected country total summary. | `database/excel/price_template express.xlsx` | `FA5B5EE75EBBC8D01AA8D6E3DA6905BBFE7CC404A7EFE49A42B67D61BA9DD9D4` | `repo://database/excel/price_template%20express.xlsx?sha256=FA5B5EE75EBBC8D01AA8D6E3DA6905BBFE7CC404A7EFE49A42B67D61BA9DD9D4` |

The source files are not sanitized or overwritten. If S&A approves a blank downloadable workbook later, it must be introduced as a new immutable registry version with its own checksum and source reference.

## Workbook-level inventory

Both files are `.xlsx` packages. No `vbaProject` part was present, so macros were not observed. Both contain `xl/externalLinks/externalLink1.xml`, drawings/media, and calculation-chain metadata; those parts were not resolved or executed.

Neither workbook contains an Excel table (`tableParts` were absent) or worksheet data-validation (`dataValidations` were absent). Therefore no dropdown is configured in the inspected source. Both contain the following 10 workbook defined names; they are recorded as source observations, not treated as application rules:

`ASDASDASDAD`, `DSDS`, `fgdfg`, `fgfhgjj`, `fggfhghj`, `hjhkhjgfh`, `Import_Pivot_Source`, `ScrollMenu1`, `sdsdasdasd`, `Total_Cost_Pivot_Source`.

The first six and `sdsdasdasd`/`Total_Cost_Pivot_Source` resolve through `#REF!` expressions. `Import_Pivot_Source` and `ScrollMenu1` reference the external `[1]Priser ind`/`[1]Lists` workbook. They are not used as dropdown or mapping definitions.

## Customer bidding workbook: `bidding.xlsx`

### Sheet inventory

| Worksheet | Dimension | Merged cells | Protected | Formula cells | Explicit unlocked cells |
| --- | --- | --- | ---: | ---: | --- |
| `Samlet 2027+2028 skabelon` | `A1:AY40` | `D27:D34`, `H27:H34`, `D7:D14`, `H7:H14`, `L7:L14`, `P7:P14`, `T7:T14`, `D17:D24`, `H17:H24`, `L17:L24`, `P17:P24`, `T17:T24` | No | 44 | None observed |
| `Lager skabelon` | `A1:AQ328` | `D24:D30`, `D7:D13`, `H7:H13`, `L7:L13`, `P7:P13`, `D16:D22`, `H16:H22`, `L16:L22`, `P16:P22` | Yes | 17 | None observed |
| `Søfragt skabelon` | `A1:AY40` | `D7:D15`, `H7:H15`, `L7:L15`, `P7:P15`, `D18:D26`, `H18:H26`, `L18:L26`, `P18:P26` | No | 48 | None observed |
| `Pakker EXP skabelon` | `A1:AY40` | `D7:D30`, `H7:H30`, `L7:L30`, `P7:P30`, `T7:T30`, `X7:X30` | No | 137 | None observed |
| `Express + Economy EXP skabelon` | `A1:AY40` | `D7:D20`, `H7:H20`, `L7:L20` | No | 25 | None observed |
| `Express + Economy IMP skabelon` | `A1:AY40` | `D7:D26`, `H7:H26`, `L7:L26` | No | 37 | None observed |

“None observed” is deliberate. Five sheets do not expose unlocked-cell metadata, and the unprotected sheets do not establish an application permission model. The contract therefore does not claim that any bidding rate cell is writable until S&A confirms it.

### Headers, units and structural mapping

The summary sheet has category labels in `C8:C12`, `C18:C22` and `C28:C32`. Its carrier groups are headed on rows `7`, `17` and `27`; source headers alternate a carrier name, `Index`, and `DKK`. The five rate sheets use the same source convention where present: index columns are `F`, `J`, `N`, `R`, `V` and `Z`; DKK columns are the following `G`, `K`, `O`, `S`, `W` and `AA` columns. These are preserved structural labels, not interpreted pricing rules.

The rate-sheet row labels are source-defined structure: warehouse service labels on `Lager skabelon`, origin labels on `Søfragt skabelon`, country labels on `Pakker EXP skabelon`, and country/service labels on the two Express + Economy sheets. The registry references their exact source ranges without copying commercial row values into code.

### Formula inventory

The following address sets account for every formula cell observed in the package. Formula text is retained in the immutable source; the examples below are evidence only and were not evaluated.

| Worksheet | Formula cell addresses | Count | Observed examples |
| --- | --- | ---: | --- |
| `Samlet 2027+2028 skabelon` | `F8,G8,J8,K8,V9,W9,N10,O10,R10,S10,R11,S11,R12,S12,J18,K18,F19,G19,N19,O19,R19,S19,V19,W19,J20,K20,N20,O20,N21,O21,N22,O22,J28,K28,F29,G29,F30,G30,J30,K30,F31,G31,F32,G32` | 44 | `=IFERROR('Lager skabelon'!F13,"")`; `='Lager skabelon'!G13`; `=IFERROR('Søfragt skabelon'!J15,"")` |
| `Lager skabelon` | `F8,F9,F10,F11,F13,G13,N8,N13,O13,R8,R9,R10,R11,R13,S13,F22,G30` | 17 | `=IFERROR((G8/O8)*100,"")`; `=SUM(G8:G12)` |
| `Søfragt skabelon` | `F8:F13,J8:J13,N8:N13,R8:R13,F15,G15,J15,K15,N15,O15,R15,S15,F19:F24,J19:J24,F26,G26,J26,K26` | 48 | `=IFERROR((G8/K19)*100,"")`; `=SUM(G8:G14)` |
| `Pakker EXP skabelon` | `F8:F28`, `J8:J11`, `J13:J28`, `N8:N28`, `R8:R28`, `V8:V28`, `Z8:Z28`, plus `F30,G30,J30,K30,N30,O30,R30,S30,V30,W30,Z30,AA30` | 137 | `=IFERROR((G8/K8)*100,"")`; `=IFERROR((G11/AA11)*100,"")`; `=SUM(AA8:AA28)` |
| `Express + Economy EXP skabelon` | `F8,J8,J9:J12,J14:J18,N9:N12,N14:N18,G20,J20,K20,N20,O20` | 25 | `=IFERROR((G8/O8)*100,"")`; `=SUM(G8:G18)` |
| `Express + Economy IMP skabelon` | `J8:J13,J15:J24,N8:N13,N15:N24,G26,J26,K26,N26,O26` | 37 | `=IFERROR((K8/G8)*100,"")`; `=SUM(O8:O24)` |

The source includes cached numeric values next to some formulas. Those cached values are not copied into the blank contract and are not treated as approved defaults.

### Field contract and uncertainties

| Contract field | Source position | Type/unit | Actor | Provenance | Blank value |
| --- | --- | --- | --- | --- | --- |
| Bid category labels | `Samlet 2027+2028 skabelon!C8:C12,C18:C22,C28:C32` | Label | Fixed template | Source structure | `null` |
| Carrier/index/DKK header groups | `Samlet 2027+2028 skabelon!E7:W7,E17:W17,E27:K27` | Label; DKK where explicitly headed | Fixed template | Source structure | `null` |
| Linked summary results | `Samlet 2027+2028 skabelon!F8:W32` | Formula output | System | Source formula | `null` |
| Rate-sheet row labels | `Rate sheets!C8:C32` | Label | Fixed template | Source structure | `null` |
| Index columns | `F8:F30,J8:J30,N8:N30,R8:R30,V8:V30,Z8:Z30` | Index/percentage label; commercial meaning unresolved | Unresolved | Source structure | `null` |
| DKK columns | `G8:G30,K8:K30,O8:O30,S8:S30,W8:W30,AA8:AA30` | Rate, DKK header | Unresolved | Source structure | `null` |

No postcode zones, bracket values, customer rows, or formula policies were invented for this workbook. The commercial cells remain unresolved because the file does not provide explicit unlocked-cell metadata for them.

## Express price workbook: `price_template express.xlsx`

### Sheet inventory

| Worksheet | Dimension | Merged cells | Protected | Formula cells | Explicit unlocked regions |
| --- | --- | --- | ---: | ---: | --- |
| `Total cost` | `A2:J32` | `C7:E7`, `B12:B13`, `D12:E12`, `C12:C13` | Yes | 36 | None observed |
| `DK-BE` | `B2:J40` | `C7:D7` | No | 0 | `C7`, `D7`, `C14:C31`, `D14:D31`, `H14:H31`, `E37:E39` |
| `DK-CN` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-DE` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-EE` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-FI` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-FR` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-ID` | `B2:J42` | `C7:D7` | No | 0 | `C7`, `D7`, `C14:C31`, `D14:D31`, `H14:H31`, `E37:E41` |
| `DK-IE` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-IT` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-LT` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-LU` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-LV` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-NL` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-NO` | `B2:J42` | `C7:D7` | No | 0 | `C7`, `D7`, `C14:C31`, `D14:D31`, `H14:H31`, `E37:E41` |
| `DK-SE` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-SI` | `B2:J40` | `C7:D7` | No | 0 | Same as `DK-BE` |
| `DK-VN` | `B2:J40` | `C7:D7` | No | 19 | Same as `DK-BE` |

There are no Excel tables or dropdowns on these sheets. The protected `Total cost` sheet has no explicit unlocked cells. The country tabs are structurally repeated, with extra fee rows on `DK-ID` and `DK-NO`.

### Header positions, units and editable regions

`Total cost!B12:E13` is the summary header. `B12` is `Transportation Types`, `C12` is `Country`, `D12:E12` is `Batch Type parcel`, `D13` is `Number of shipments`, and `E13` is explicitly `Total costs, DKK`. `B14:C30` contains source-defined country/type rows and `D14:E30` are linked totals; `D31:E31` are summary formulas.

Each country tab has:

- `B2` title, `B3:B5` source instructions, and `B7` `Vendor name:`.
- `B12` `Table 1: Shipment information and cost`, `H12` `Return`.
- `B13:F13` headers `Weight`, `Economy`, `Express`, `Number of shipments`, `Total`; `H13` is `Pickup`; `J13` is `% Economy`.
- `B14:B31` source-defined weight bands and `B32` `Total`.
- `B36` `Additional fee` and `E36` explicitly `Cost (DKK)`. `DK-ID` and `DK-NO` also have source fee labels through row 41.

The source prompt says “fill in all the price fields in column C, D, H and I”, but the inspected unlocked-cell metadata includes `C`, `D`, and `H`, not `I`. The registry records this mismatch as an uncertainty and does not make `I` editable.

The source marks these cells as unlocked on country tabs: `C7:D7` vendor identity, `C14:D31` Economy/Express price fields, `H14:H31` Pickup fields, and `E37:E39` fee costs (with `E40:E41` on `DK-ID` and `DK-NO`). `C/D/H` do not carry an explicit currency label in the header, so their currency remains `null`; only `E36` and `Total cost!E13` explicitly state DKK. The source contains accounting-style number formats with `kr`, but a number format is not treated as a commercial currency approval.

### Formula inventory

| Worksheet group | Formula cell addresses | Count | Observed behavior |
| --- | --- | ---: | --- |
| `Total cost` | `D14:D30`, `E14:E30`, `D31`, `E31` | 36 | Country-sheet references such as `='DK-BE'!E32`; totals such as `=SUM(D14:D30)` |
| `DK-BE`, `DK-CN`, `DK-DE`, `DK-EE`, `DK-FI`, `DK-FR`, `DK-ID`, `DK-IE`, `DK-IT`, `DK-LT`, `DK-LU`, `DK-LV`, `DK-NL`, `DK-NO`, `DK-SE`, `DK-SI` | None | 0 | No cell formulas were present in the inspected XML. Formula inheritance is not assumed. |
| `DK-VN` | `F14:F32` | 19 | `F14` has `=(E14*J14*C14)+(E14*(1-1*J14)*D14)`; `F15:F31` contain empty formula elements in the source; `F32` has `=SUM(F14:F31)`. These were not repaired or executed. |

### Field-by-field blank contract

| Contract field | Source position | Type/unit | Actor | Provenance | Blank value |
| --- | --- | --- | --- | --- | --- |
| Summary country/type labels | `Total cost!B12:C30` | Label | Fixed template | Source structure | `null` |
| Summary linked shipment counts and totals | `Total cost!D14:E31` | Formula output; E explicitly DKK | System | Source formula | `null` |
| Vendor name | Country tabs `C7:D7` | Text | Carrier-entered | Source editable style | `null` |
| Source weight bands | Country tabs `B14:B32` | Label, kg context | Fixed template | Source structure | `null` |
| Economy and Express prices | Country tabs `C14:D31` | Decimal/rate; currency unresolved | Carrier-entered | Source editable style | `null` |
| Pickup prices | Country tabs `H14:H31` | Decimal/rate; currency unresolved | Carrier-entered | Source editable style | `null` |
| Additional fees | Country tabs `E37:E39`, plus `E40:E41` for `DK-ID`/`DK-NO` | Decimal/fee, DKK header at E36 | Carrier-entered | Source editable style | `null` |
| `% Economy` | `J13:J31` | Percentage label | Unresolved | Source structure | `null` |

No postcode-zone rule, shipment-count default, band calculation, or fee rule was added. The “Number of shipments” and `% Economy` semantics remain a review item even though the source labels are visible.

## Registry and application contract

The application registry lives in `packages/shared/src/templates/registry.ts` and exposes immutable `1.0.0` entries for both inspected sources. Each entry carries the ID, kind, version, mapping status, SHA-256 checksum, exact immutable file reference, worksheet inventory, merged ranges, table/named-range/dropdown observations, formula counts/address sets, source-derived editable regions, and blank-input contract.

The API exposes read-only, access-controlled endpoints through Documents:

- `GET /api/documents/templates`
- `GET /api/documents/templates/:templateId/versions/:version`

Both endpoints require an authenticated principal with `permissions.readTemplates` and access to the `documents/templates` destination (or `*`). There is no update route, so a new template cannot silently replace an existing tender version. A tender should persist the template ID, version, and source checksum using the shared `TemplateVersionBinding` contract.

The Documents screen has a “Tender price template” tab. It is administrator-only; carriers do not receive the registry metadata or version details. The tender API likewise keeps the `express-price` workbook administrator-only, including direct draft reads and writes. Administrators see registry structure and review notes when access is granted, while other authenticated tender users see only carrier-facing workbook configuration. The UI shows explicit sign-in/access errors or `Template not configured` when no visible configured template is returned. It never fabricates sheet names, fields, rates, zones, or formulas.
