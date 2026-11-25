import { z } from "zod";

export const workbookTemplateKindSchema = z.enum([
  "customer-bidding",
  "express-price",
]);

export const templateMappingStatusSchema = z.enum(["unverified", "verified"]);

export const templateFieldTypeSchema = z.enum([
  "label",
  "text",
  "integer",
  "decimal",
  "currency",
  "percentage",
  "formula",
]);

export const templateActorSchema = z.enum([
  "fixed-template",
  "customer",
  "carrier",
  "system",
  "unresolved",
]);

export const templateProvenanceSchema = z.enum([
  "source-structure",
  "source-editable-style",
  "source-formula",
  "blank-input-contract",
]);

export const templateRegionSchema = z.object({
  id: z.string().min(1),
  sheet: z.string().min(1),
  address: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  type: templateFieldTypeSchema,
  actor: templateActorSchema,
  unit: z.string().nullable(),
  currency: z.string().nullable(),
  provenance: templateProvenanceSchema,
  blankValue: z.null(),
  sourceEvidence: z.string().min(1),
});

export type TemplateRegion = z.infer<typeof templateRegionSchema>;

export const templateFormulaInventorySchema = z.object({
  addresses: z.string().min(1),
  count: z.number().int().positive(),
  examples: z.array(z.string().min(1)),
  provenance: z.literal("source-formula"),
});

export const templateSheetSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  dimension: z.string().min(1),
  mergedRanges: z.array(z.string().min(1)),
  tableNames: z.array(z.string().min(1)),
  namedRanges: z.array(z.string().min(1)),
  dropdowns: z.array(z.string().min(1)),
  formulaCount: z.number().int().nonnegative(),
  formulaInventory: z.array(templateFormulaInventorySchema),
  editableRegions: z.array(templateRegionSchema),
  protectionObserved: z.enum(["protected", "unprotected", "not-observed"]),
});

export type TemplateSheet = z.infer<typeof templateSheetSchema>;

export const templateSourceSchema = z.object({
  fileName: z.string().min(1),
  relativePath: z.string().min(1),
  immutableFileReference: z.string().min(1),
  sha256: z.string().regex(/^[A-F0-9]{64}$/),
});

export type TemplateSource = z.infer<typeof templateSourceSchema>;

export const templateVersionSchema = z.object({
  id: z.string().min(1),
  kind: workbookTemplateKindSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  mappingStatus: templateMappingStatusSchema,
  immutable: z.literal(true),
  blankContract: z.object({
    commercialInputsBlank: z.literal(true),
    businessRows: z.literal(0),
    formulasExecuted: z.literal(false),
    sourcePreserved: z.literal(true),
  }),
  source: templateSourceSchema,
  workbook: z.object({
    worksheetCount: z.number().int().positive(),
    tableCount: z.number().int().nonnegative(),
    dropdownCount: z.number().int().nonnegative(),
    namedRangeCount: z.number().int().nonnegative(),
    externalLinkObserved: z.boolean(),
    macrosObserved: z.boolean(),
  }),
  fields: z.array(templateRegionSchema),
  sheets: z.array(templateSheetSchema),
  reviewNotes: z.array(z.string().min(1)),
});

export type TemplateVersion = z.infer<typeof templateVersionSchema>;

export const templateVersionBindingSchema = z.object({
  templateId: z.string().min(1),
  templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  sourceSha256: z.string().regex(/^[A-F0-9]{64}$/),
});

export type TemplateVersionBinding = z.infer<
  typeof templateVersionBindingSchema
>;

const blankRegion = (
  region: Omit<TemplateRegion, "blankValue">,
): TemplateRegion => ({ ...region, blankValue: null });

const biddingSummaryFields = [
  blankRegion({
    id: "bidding.summary.category-labels",
    sheet: "Samlet 2027+2028 skabelon",
    address: "C8:C12,C18:C22,C28:C32",
    label: "Source-defined bid category labels",
    order: 1,
    type: "label",
    actor: "fixed-template",
    unit: null,
    currency: null,
    provenance: "source-structure",
    sourceEvidence:
      "Source labels are present in the listed cells; exact text remains in the immutable workbook.",
  }),
  blankRegion({
    id: "bidding.summary.carrier-columns",
    sheet: "Samlet 2027+2028 skabelon",
    address: "E7:W7,E17:W17,E27:K27",
    label: "Carrier, Index and DKK header groups",
    order: 2,
    type: "label",
    actor: "fixed-template",
    unit: null,
    currency: "DKK",
    provenance: "source-structure",
    sourceEvidence:
      "Header rows 7, 17 and 27 contain the source carrier and unit labels.",
  }),
  blankRegion({
    id: "bidding.summary.linked-results",
    sheet: "Samlet 2027+2028 skabelon",
    address: "F8:W32",
    label: "Cross-sheet summary results",
    order: 3,
    type: "formula",
    actor: "system",
    unit: null,
    currency: null,
    provenance: "source-formula",
    sourceEvidence:
      "44 formula cells link the summary to the five rate sheets.",
  }),
] satisfies TemplateRegion[];

const biddingRateSheetFields = [
  {
    sheet: "Lager skabelon",
    labelRange: "C8:C30",
    indexRange: "F8:F30,J8:J30,N8:N30,R8:R30",
    dkkRange: "G8:G30,K8:K30,O8:O30,S8:S30",
  },
  {
    sheet: "Søfragt skabelon",
    labelRange: "C8:C26",
    indexRange: "F8:F26,J8:J26,N8:N26,R8:R26",
    dkkRange: "G8:G26,K8:K26,O8:O26,S8:S26",
  },
  {
    sheet: "Pakker EXP skabelon",
    labelRange: "C8:C30",
    indexRange: "F8:F30,J8:J30,N8:N30,R8:R30,V8:V30,Z8:Z30",
    dkkRange: "G8:G30,K8:K30,O8:O30,S8:S30,W8:W30,AA8:AA30",
  },
  {
    sheet: "Express + Economy EXP skabelon",
    labelRange: "C8:C20",
    indexRange: "F8:F20,J8:J20,N8:N20",
    dkkRange: "G8:G20,K8:K20,O8:O20",
  },
  {
    sheet: "Express + Economy IMP skabelon",
    labelRange: "C8:C26",
    indexRange: "F8:F26,J8:J26,N8:N26",
    dkkRange: "G8:G26,K8:K26,O8:O26",
  },
] as const;

const biddingRateFields: TemplateRegion[] = biddingRateSheetFields.flatMap(
  ({ sheet, labelRange, indexRange, dkkRange }) => [
    blankRegion({
      id: `bidding.${sheet}.labels`,
      sheet,
      address: labelRange,
      label: "Source-defined service, origin or destination labels",
      order: 1,
      type: "label",
      actor: "fixed-template",
      unit: null,
      currency: null,
      provenance: "source-structure",
      sourceEvidence:
        "The source sheet carries labels in column C; no labels are copied into commercial input data.",
    }),
    blankRegion({
      id: `bidding.${sheet}.index`,
      sheet,
      address: indexRange,
      label: "Index columns",
      order: 2,
      type: "percentage",
      actor: "unresolved",
      unit: "index",
      currency: null,
      provenance: "source-structure",
      sourceEvidence:
        "Source headers explicitly label these columns Index; editability is not exposed as unlocked cells.",
    }),
    blankRegion({
      id: `bidding.${sheet}.dkk`,
      sheet,
      address: dkkRange,
      label: "DKK commercial rate columns",
      order: 3,
      type: "currency",
      actor: "unresolved",
      unit: "rate",
      currency: "DKK",
      provenance: "source-structure",
      sourceEvidence:
        "Source headers explicitly label these columns DKK; editability is not exposed as unlocked cells.",
    }),
  ],
);

const biddingFormula = (
  addresses: string,
  count: number,
  examples: string[],
): z.infer<typeof templateFormulaInventorySchema> => ({
  addresses,
  count,
  examples,
  provenance: "source-formula",
});

const biddingSheets: TemplateSheet[] = [
  {
    name: "Samlet 2027+2028 skabelon",
    role: "bid summary",
    dimension: "A1:AY40",
    mergedRanges: [
      "D27:D34",
      "H27:H34",
      "D7:D14",
      "H7:H14",
      "L7:L14",
      "P7:P14",
      "T7:T14",
      "D17:D24",
      "H17:H24",
      "L17:L24",
      "P17:P24",
      "T17:T24",
    ],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 44,
    formulaInventory: [
      biddingFormula("F8:W32, excluding blank summary cells", 44, [
        "=IFERROR('Lager skabelon'!F13,\"\")",
        "='Lager skabelon'!G13",
        "=IFERROR('Søfragt skabelon'!J15,\"\")",
      ]),
    ],
    editableRegions: [],
    protectionObserved: "unprotected",
  },
  {
    name: "Lager skabelon",
    role: "warehouse rate sheet",
    dimension: "A1:AQ328",
    mergedRanges: [
      "D24:D30",
      "D7:D13",
      "H7:H13",
      "L7:L13",
      "P7:P13",
      "D16:D22",
      "H16:H22",
      "L16:L22",
      "P16:P22",
    ],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 17,
    formulaInventory: [
      biddingFormula(
        "F8,F9,F10,F11,F13,G13,N8,N13,O13,R8,R9,R10,R11,R13,S13,F22,G30",
        17,
        ["=SUM(G8:G12)", '=IFERROR((G8/O8)*100,"")'],
      ),
    ],
    editableRegions: [],
    protectionObserved: "protected",
  },
  {
    name: "Søfragt skabelon",
    role: "sea freight rate sheet",
    dimension: "A1:AY40",
    mergedRanges: [
      "D7:D15",
      "H7:H15",
      "L7:L15",
      "P7:P15",
      "D18:D26",
      "H18:H26",
      "L18:L26",
      "P18:P26",
    ],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 48,
    formulaInventory: [
      biddingFormula("F8:R13,F15:S15,F19:J24,F26:K26", 48, [
        '=IFERROR((G8/K19)*100,"")',
        "=SUM(G8:G14)",
      ]),
    ],
    editableRegions: [],
    protectionObserved: "unprotected",
  },
  {
    name: "Pakker EXP skabelon",
    role: "parcel export rate sheet",
    dimension: "A1:AY40",
    mergedRanges: ["D7:D30", "H7:H30", "L7:L30", "P7:P30", "T7:T30", "X7:X30"],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 137,
    formulaInventory: [
      biddingFormula(
        "F8:F28,J8:J28 except J12,N8:N28,R8:R28,V8:V28,Z8:Z28; row 30 summary cells",
        137,
        [
          '=IFERROR((G8/K8)*100,"")',
          '=IFERROR((G11/AA11)*100,"")',
          "=SUM(AA8:AA28)",
        ],
      ),
    ],
    editableRegions: [],
    protectionObserved: "unprotected",
  },
  {
    name: "Express + Economy EXP skabelon",
    role: "express and economy export rate sheet",
    dimension: "A1:AY40",
    mergedRanges: ["D7:D20", "H7:H20", "L7:L20"],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 25,
    formulaInventory: [
      biddingFormula(
        "F8,J8,J9:J12,J14:J18,N9:N12,N14:N18,G20,J20,K20,N20,O20",
        25,
        ['=IFERROR((G8/O8)*100,"")', "=SUM(G8:G18)"],
      ),
    ],
    editableRegions: [],
    protectionObserved: "unprotected",
  },
  {
    name: "Express + Economy IMP skabelon",
    role: "express and economy import rate sheet",
    dimension: "A1:AY40",
    mergedRanges: ["D7:D26", "H7:H26", "L7:L26"],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 37,
    formulaInventory: [
      biddingFormula("J8:J24,N8:N24,G26,J26,K26,N26,O26", 37, [
        '=IFERROR((K8/G8)*100,"")',
        "=SUM(O8:O24)",
      ]),
    ],
    editableRegions: [],
    protectionObserved: "unprotected",
  },
];

const countrySheetNames = [
  "DK-BE",
  "DK-CN",
  "DK-DE",
  "DK-EE",
  "DK-FI",
  "DK-FR",
  "DK-ID",
  "DK-IE",
  "DK-IT",
  "DK-LT",
  "DK-LU",
  "DK-LV",
  "DK-NL",
  "DK-NO",
  "DK-SE",
  "DK-SI",
  "DK-VN",
] as const;

const priceEditableRegions = (
  sheet: string,
  feeEndRow: 39 | 41,
): TemplateRegion[] => [
  blankRegion({
    id: `express-price.${sheet}.vendor`,
    sheet,
    address: "C7:D7",
    label: "Vendor name",
    order: 1,
    type: "text",
    actor: "carrier",
    unit: null,
    currency: null,
    provenance: "source-editable-style",
    sourceEvidence:
      "The source workbook marks C7 and D7 as unlocked and merges them for the vendor name.",
  }),
  blankRegion({
    id: `express-price.${sheet}.parcel-rates`,
    sheet,
    address: "C14:D31",
    label: "Economy and Express price fields for source-defined weight bands",
    order: 2,
    type: "currency",
    actor: "carrier",
    unit: "rate",
    currency: null,
    provenance: "source-editable-style",
    sourceEvidence:
      "C14:D31 are unlocked in the source workbook; the sheet header does not state a currency for these cells.",
  }),
  blankRegion({
    id: `express-price.${sheet}.pickup-rates`,
    sheet,
    address: "H14:H31",
    label: "Pickup price fields",
    order: 3,
    type: "currency",
    actor: "carrier",
    unit: "rate",
    currency: null,
    provenance: "source-editable-style",
    sourceEvidence:
      "H14:H31 are unlocked and H13 is labeled Pickup; the source does not state a currency in that header.",
  }),
  blankRegion({
    id: `express-price.${sheet}.additional-fees`,
    sheet,
    address: `E37:E${feeEndRow}`,
    label: "Additional fee costs",
    order: 4,
    type: "currency",
    actor: "carrier",
    unit: "fee",
    currency: "DKK",
    provenance: "source-editable-style",
    sourceEvidence: `E37:E${feeEndRow} are unlocked; E36 is explicitly labeled Cost (DKK).`,
  }),
];

const priceCountrySheet = (
  name: (typeof countrySheetNames)[number],
): TemplateSheet => {
  const hasExtraFees = name === "DK-ID" || name === "DK-NO";
  const hasSourceFormulas = name === "DK-VN";
  return {
    name,
    role: "country-specific carrier price input",
    dimension: hasExtraFees ? "B2:J42" : "B2:J40",
    mergedRanges: ["C7:D7"],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: hasSourceFormulas ? 19 : 0,
    formulaInventory: hasSourceFormulas
      ? [
          biddingFormula("F14:F32", 19, [
            "=(E14*J14*C14)+(E14*(1-1*J14)*D14)",
            "=SUM(F14:F31)",
          ]),
        ]
      : [],
    editableRegions: priceEditableRegions(name, hasExtraFees ? 41 : 39),
    protectionObserved: "unprotected",
  };
};

const expressPriceSheets: TemplateSheet[] = [
  {
    name: "Total cost",
    role: "protected country total summary",
    dimension: "A2:J32",
    mergedRanges: ["C7:E7", "B12:B13", "D12:E12", "C12:C13"],
    tableNames: [],
    namedRanges: [],
    dropdowns: [],
    formulaCount: 36,
    formulaInventory: [
      biddingFormula("D14:E30,D31:E31", 36, ["='DK-BE'!E32", "=SUM(D14:D30)"]),
    ],
    editableRegions: [],
    protectionObserved: "protected",
  },
  ...countrySheetNames.map(priceCountrySheet),
];

const expressPriceFields: TemplateRegion[] = [
  blankRegion({
    id: "express-price.summary",
    sheet: "Total cost",
    address: "B12:E31",
    label: "Country total summary and source-defined country labels",
    order: 1,
    type: "formula",
    actor: "system",
    unit: "total",
    currency: "DKK",
    provenance: "source-formula",
    sourceEvidence:
      "The protected Total cost sheet links country sheets and labels E13 Total costs, DKK.",
  }),
  ...countrySheetNames.flatMap((sheet) => [
    blankRegion({
      id: `express-price.${sheet}.structure`,
      sheet,
      address: "B2:B5,B7,B14:B32",
      label: "Source instructions, vendor label, weight bands and total row",
      order: 2,
      type: "label",
      actor: "fixed-template",
      unit: "kg where stated by the source band labels",
      currency: null,
      provenance: "source-structure",
      sourceEvidence:
        "The country tab carries its own title, instructions, vendor label, weight-band labels and Total row.",
    }),
    ...priceEditableRegions(
      sheet,
      sheet === "DK-ID" || sheet === "DK-NO" ? 41 : 39,
    ),
  ]),
];

const registryInput = [
  {
    id: "customer-bidding",
    kind: "customer-bidding",
    version: "1.0.0",
    title: "Customer bidding workbook",
    mappingStatus: "unverified",
    immutable: true,
    blankContract: {
      commercialInputsBlank: true,
      businessRows: 0,
      formulasExecuted: false,
      sourcePreserved: true,
    },
    source: {
      fileName: "bidding.xlsx",
      relativePath: "database/excel/bidding.xlsx",
      immutableFileReference:
        "repo://database/excel/bidding.xlsx?sha256=A4A0E03EA5F403BD45E35661CC0829FC5AC6197AF6A72BFBDFA538C275BBF37D",
      sha256:
        "A4A0E03EA5F403BD45E35661CC0829FC5AC6197AF6A72BFBDFA538C275BBF37D",
    },
    workbook: {
      worksheetCount: 6,
      tableCount: 0,
      dropdownCount: 0,
      namedRangeCount: 10,
      externalLinkObserved: true,
      macrosObserved: false,
    },
    fields: [...biddingSummaryFields, ...biddingRateFields],
    sheets: biddingSheets,
    reviewNotes: [
      "Purpose is a multi-sheet bid/rate aggregation workbook for 2027+2028, not shipment history.",
      "No cells were observed as explicitly unlocked; writable commercial regions remain unresolved and are not presented as configured input fields.",
      "The workbook contains broken or external defined names and an external link; these are preserved as source observations, not interpreted as commercial rules.",
      "Index, bracket, carrier and formula semantics require S&A review before mapping status can become verified.",
    ],
  },
  {
    id: "express-price",
    kind: "express-price",
    version: "1.0.0",
    title: "Express price workbook",
    mappingStatus: "unverified",
    immutable: true,
    blankContract: {
      commercialInputsBlank: true,
      businessRows: 0,
      formulasExecuted: false,
      sourcePreserved: true,
    },
    source: {
      fileName: "price_template express.xlsx",
      relativePath: "database/excel/price_template express.xlsx",
      immutableFileReference:
        "repo://database/excel/price_template%20express.xlsx?sha256=FA5B5EE75EBBC8D01AA8D6E3DA6905BBFE7CC404A7EFE49A42B67D61BA9DD9D4",
      sha256:
        "FA5B5EE75EBBC8D01AA8D6E3DA6905BBFE7CC404A7EFE49A42B67D61BA9DD9D4",
    },
    workbook: {
      worksheetCount: 18,
      tableCount: 0,
      dropdownCount: 0,
      namedRangeCount: 10,
      externalLinkObserved: true,
      macrosObserved: false,
    },
    fields: expressPriceFields,
    sheets: expressPriceSheets,
    reviewNotes: [
      "Purpose is a carrier-facing express/economy parcel price and cost input workbook with a protected country total summary.",
      "The source marks vendor name, parcel price and pickup cells, plus fee cost cells, as unlocked on country tabs; commercial values are excluded from this contract.",
      "The source prompt mentions columns C, D, H and I, while the inspected unlocked cells include H but not I; this discrepancy remains unverified.",
      "Only DK-VN contains the observed row-total formulas; other country sheets contain no cell formulas in the inspected XML, so formula inheritance is not assumed.",
      "Weight bands, fee rows, currencies for C/D/H and shipment-count semantics require S&A review before mapping status can become verified.",
    ],
  },
] as const;

export const templateRegistry: readonly TemplateVersion[] = Object.freeze(
  z.array(templateVersionSchema).parse(registryInput),
);

export function listTemplateVersions(): TemplateVersion[] {
  return templateRegistry.map((template) => ({
    ...template,
    fields: [...template.fields],
    sheets: [...template.sheets],
    reviewNotes: [...template.reviewNotes],
  }));
}

export function findTemplateVersion(
  id: string,
  version: string,
): TemplateVersion | undefined {
  return templateRegistry.find(
    (template) => template.id === id && template.version === version,
  );
}
