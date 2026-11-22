export type WorkbookCellKind =
  | "structural"
  | "editable-text"
  | "editable-decimal"
  | "editable-currency"
  | "formula";

export type WorkbookColumn = {
  key: string;
  label: string;
  group?: string;
  kind: WorkbookCellKind;
  unit: string | null;
  currency: string | null;
  sourceColumn?: string;
};

export type WorkbookRow = {
  key: string;
  label: string;
  sourceRow: number;
  kind?: "matrix" | "total" | "structural";
  structuralValues?: Record<string, string>;
};

export type WorkbookSection = {
  key: string;
  title: string;
  sourceHeaderRow?: number;
  rowHeaderLabel?: string;
  columns: WorkbookColumn[];
  rows: WorkbookRow[];
};

export type WorkbookSheet = {
  name: string;
  role: string;
  notes?: readonly string[];
  sections: WorkbookSection[];
};

export type VerifiedTemplateView = {
  id: "customer-bidding" | "express-price";
  title: string;
  sheets: WorkbookSheet[];
};

const structural = (
  key: string,
  label: string,
  sourceColumn?: string,
): WorkbookColumn => ({
  key,
  label,
  kind: "structural",
  unit: null,
  currency: null,
  sourceColumn,
});

const formula = (
  key: string,
  label: string,
  unit: string | null = null,
  currency: string | null = null,
  sourceColumn?: string,
  group?: string,
): WorkbookColumn => ({
  key,
  label,
  group,
  kind: "formula",
  unit,
  currency,
  sourceColumn,
});

const editable = (
  key: string,
  label: string,
  kind: "editable-text" | "editable-decimal" | "editable-currency",
  unit: string | null,
  currency: string | null,
  sourceColumn?: string,
): WorkbookColumn => ({
  key,
  label,
  kind,
  unit,
  currency,
  sourceColumn,
});

const sourceRows = (
  labels: readonly string[],
  firstSourceRow: number,
  kind: WorkbookRow["kind"] = "matrix",
): WorkbookRow[] =>
  labels.map((label, index) => ({
    key: `row-${firstSourceRow + index}`,
    label,
    sourceRow: firstSourceRow + index,
    kind,
  }));

const totalRow = (sourceRow: number, label = "Samlet"): WorkbookRow => ({
  key: `row-${sourceRow}`,
  label,
  sourceRow,
  kind: "total",
});

const summaryRows = (
  labels: readonly string[],
  firstSourceRow: number,
): WorkbookRow[] =>
  labels.map((label, index) => ({
    key: `row-${firstSourceRow + index}`,
    label: "Economy + express",
    sourceRow: firstSourceRow + index,
    structuralValues: { country: label },
  }));

const biddingGroups = {
  summaryOne: {
    title: "Rhenus 2026-2027 (inkl. nettoregulering)",
    columns: [
      ["rhenus-index", "Index", "F"],
      ["rhenus-dkk", "DKK", "G"],
      ["df-index", "Index", "J"],
      ["df-dkk", "DKK", "K"],
      ["gls-index", "Index", "N"],
      ["gls-dkk", "DKK", "O"],
      ["ups-index", "Index", "R"],
      ["ups-dkk", "DKK", "S"],
      ["universal-index", "Index", "V"],
      ["universal-dkk", "DKK", "W"],
    ] as const,
    rows: [
      "Lager",
      "Søfragt IMP",
      "Pakker EXP",
      "Express + Economy EXP",
      "Express + Economy IMP",
    ],
    sourceRow: 8,
  },
  summaryTwo: {
    title: "K&N",
    columns: [
      ["kn-index", "Index", "F"],
      ["kn-dkk", "DKK", "G"],
      ["postnord-index", "Index", "J"],
      ["postnord-dkk", "DKK", "K"],
      ["leman-index", "Index", "N"],
      ["leman-dkk", "DKK", "O"],
      ["scan-global-index", "Index", "R"],
      ["scan-global-dkk", "DKK", "S"],
      ["blue-water-index", "Index", "V"],
      ["blue-water-dkk", "DKK", "W"],
    ] as const,
    rows: [
      "Lager",
      "Søfragt IMP",
      "Pakker EXP",
      "Express + Economy EXP",
      "Express + Economy IMP",
    ],
    sourceRow: 18,
  },
  summaryThree: {
    title: "DSV",
    columns: [
      ["dsv-index", "Index", "F"],
      ["dsv-dkk", "DKK", "G"],
      ["system-index", "Index", "J"],
      ["system-dkk", "DKK", "K"],
    ] as const,
    rows: [
      "Lager",
      "Søfragt IMP",
      "Pakker EXP",
      "Express + Economy EXP",
      "Express + Economy IMP",
    ],
    sourceRow: 28,
  },
} as const;

function biddingColumns(
  columns: readonly (readonly [string, string, string])[],
): WorkbookColumn[] {
  return columns.map(([key, label, sourceColumn]) =>
    formula(
      key,
      label,
      label === "Index" ? "index" : "rate",
      label === "DKK" ? "DKK" : null,
      sourceColumn,
      groupLabel(key),
    ),
  );
}

function groupLabel(key: string): string {
  const labels: Record<string, string> = {
    rhenus: "Rhenus 2026-2027 (inkl. nettoregulering)",
    df: "DF",
    gls: "GLS",
    ups: "UPS",
    universal: "Universal Transport",
    kn: "K&N",
    postnord: "PostNord",
    leman: "Leman",
    "scan-global": "Scan Global",
    "blue-water": "Blue Water",
    dsv: "DSV",
    system: "System Transport",
    "rhenus-2025": "Rhenus 2025",
    "warehouse-move": "Lagerflytning",
  };
  const prefix = key.replace(/-(?:index|dkk)$/, "");
  return labels[prefix] ?? prefix;
}

function summarySection(
  key: string,
  group: (typeof biddingGroups)[keyof typeof biddingGroups],
): WorkbookSection {
  return {
    key,
    title: group.title,
    sourceHeaderRow: group.sourceRow - 1,
    rowHeaderLabel: "Category",
    columns: biddingColumns(group.columns),
    rows: [
      ...sourceRows(group.rows, group.sourceRow),
      totalRow(group.sourceRow + 6),
    ],
  };
}

const warehouseLabels = [
  "Handling ind",
  "Lagerleje",
  "Pluk & Pak og handling ud",
  "Andre udgifter",
] as const;

const seaLabels = [
  'Kina Qindao "CNQIN" (FOB)',
  'Kina Shanghai "CNSGH" (FOB)',
  'Kina Yantian "CNYTN" (FOB)',
  "Kina Hong Kong (FOB)",
  'Indonisien Semarang "IDSRG" (FOB)',
  "Vietnam Ho Chi Minh City (FOB)",
] as const;

const parcelLabels = [
  "Austria",
  "Belgium",
  "Czech Republic",
  "Germany",
  "Denmark",
  "Estonia",
  "Spain",
  "Finland",
  "France",
  "Hungary",
  "Ireland",
  "Italy",
  "Lihuania",
  "Luxembourg",
  "Netherlands",
  "Norway",
  "Poland",
  "Portugal",
  "Romania",
  "Sweden",
  "Slovakia",
] as const;

const exportLabels = [
  "Austalia",
  "Canada",
  "Switzerland",
  "China",
  "Germany",
  "Denmark",
  "France",
  "Netherlands",
  "Poland",
  "United States",
  "Vietnman",
] as const;

const importLabels = [
  "Belgium",
  "China",
  "Germany",
  "Estonia",
  "Finland",
  "France",
  "Indonesia",
  "Ireland",
  "Italy",
  "Lithuania",
  "Luxembourg",
  "Latvia",
  "Netherlands",
  "Norway",
  "Sweden",
  "Slovenia",
  "Vietnam",
] as const;

const biddingRateColumns = (
  groups: readonly (readonly [string, string])[],
): WorkbookColumn[] =>
  groups.flatMap(([key, label]) => [
    { ...formula(`${key}-index`, "Index", "index", null), group: label },
    { ...formula(`${key}-dkk`, "DKK", "rate", "DKK"), group: label },
  ]);

const rateSection = (
  key: string,
  title: string,
  labels: readonly string[],
  firstRow: number,
  groups: readonly (readonly [string, string])[],
  totalSourceRow: number,
): WorkbookSection => ({
  key,
  title,
  sourceHeaderRow: firstRow - 1,
  columns: biddingRateColumns(groups),
  rows: [...sourceRows(labels, firstRow), totalRow(totalSourceRow)],
});

const biddingSheets: WorkbookSheet[] = [
  {
    name: "Samlet 2027+2028 skabelon",
    role: "bid summary",
    sections: [
      summarySection("summary-rhenus", biddingGroups.summaryOne),
      summarySection("summary-kn", biddingGroups.summaryTwo),
      summarySection("summary-dsv", biddingGroups.summaryThree),
    ],
  },
  {
    name: "Lager skabelon",
    role: "warehouse rate sheet",
    sections: [
      rateSection(
        "warehouse-rates",
        "Rhenus 2026-2027 (inkl. nettoregulering)",
        warehouseLabels,
        8,
        [
          ["rhenus", "Rhenus 2026-2027 (inkl. nettoregulering)"],
          ["df", "DF"],
          ["postnord", "PostNord"],
          ["system", "System Transport"],
        ],
        13,
      ),
      rateSection(
        "warehouse-move",
        "Lagerflytning",
        [
          "Udlæring (4.500 paller udlæring af 16,84 dkk + div)",
          "Transport (137 full-loads af 1.250 dkk)",
          "Indlæring",
          "IT-opsætning",
        ],
        17,
        [["warehouse-move", "Lagerflytning"]],
        22,
      ),
      rateSection(
        "warehouse-legacy",
        "Rhenus 2025",
        warehouseLabels,
        25,
        [["rhenus-2025", "Rhenus 2025"]],
        30,
      ),
    ],
  },
  {
    name: "Søfragt skabelon",
    role: "sea freight rate sheet",
    sections: [
      rateSection(
        "sea-primary",
        "K & N",
        seaLabels,
        8,
        [
          ["kn", "K & N"],
          ["universal", "Universal Transport"],
          ["leman", "Leman"],
          ["scan-global", "Scan Global"],
        ],
        15,
      ),
      rateSection(
        "sea-secondary",
        "Blue Water",
        seaLabels,
        19,
        [
          ["blue-water", "Blue Water"],
          ["dsv", "DSV"],
        ],
        26,
      ),
    ],
  },
  {
    name: "Pakker EXP skabelon",
    role: "parcel export rate sheet",
    sections: [
      rateSection(
        "parcel-export",
        "Parcel export",
        parcelLabels,
        8,
        [
          ["gls", "GLS"],
          ["ups", "UPS"],
          ["postnord", "PostNord"],
          ["leman", "Leman"],
          ["dsv", "DSV"],
          ["system", "System Transport"],
        ],
        30,
      ),
    ],
  },
  {
    name: "Express + Economy EXP skabelon",
    role: "express and economy export rate sheet",
    sections: [
      rateSection(
        "express-export",
        "Express + Economy EXP",
        exportLabels,
        8,
        [
          ["ups", "UPS"],
          ["leman", "Leman"],
          ["dsv", "DSV"],
        ],
        20,
      ),
    ],
  },
  {
    name: "Express + Economy IMP skabelon",
    role: "express and economy import rate sheet",
    sections: [
      rateSection(
        "express-import",
        "Express + Economy IMP",
        importLabels,
        8,
        [
          ["ups", "UPS"],
          ["leman", "Leman"],
          ["dsv", "DSV"],
        ],
        26,
      ),
    ],
  },
];

const weightBands = [
  "0-1 kg",
  "1-5 kg",
  "5-10 kg",
  "10-15 kg",
  "15-20 kg",
  "20-25 kg",
  "25-30 kg",
  "30-35 kg",
  "35-40 kg",
  "40-45 kg",
  "45-50 kg",
  "50-75 kg",
  "75-100 kg",
  "100-150 kg",
  "150-200 kg",
  "200-250 kg",
  "250-300 kg",
  "Over 300 kg",
] as const;

const priceColumns: WorkbookColumn[] = [
  editable("economy", "Economy", "editable-decimal", "rate", null, "C"),
  editable("express", "Express", "editable-decimal", "rate", null, "D"),
  structural("shipments", "Number of shipments", "E"),
  formula("total", "Total", "total", null, "F"),
  editable("pickup", "Pickup", "editable-decimal", "rate", null, "H"),
  formula("economy-share", "% Economy", "percentage", null, "J"),
];

for (const column of priceColumns.slice(0, 4))
  column.group = "Table 1: Shipment information and cost";
priceColumns[4].group = "Return";

const feeRows = (extra: boolean): WorkbookRow[] =>
  sourceRows(
    extra
      ? [
          "Fixed am delivery (before 10.00)",
          "Fixed am delivery (before 12.00)",
          "Export declaration (per shipment)",
          "Custom clearance (per shipment)",
          "Waiting time per 15 min after 15 min",
        ]
      : [
          "Fixed am delivery (before 10.00)",
          "Fixed am delivery (before 12.00)",
          "Waiting time per 15 min after 15 min",
        ],
    37,
  );

const countrySheets = [
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

const expressSheets: WorkbookSheet[] = [
  {
    name: "Total cost",
    role: "protected country total summary",
    notes: [
      "This sheet shows total cost per country and per weight range.",
      "The same numbers can be found in each country specific price sheet respectively.",
      "Please fill out vendor name (or check if name is correct if already filled out).",
    ],
    sections: [
      {
        key: "country-total",
        title: "Total cost UMAGE",
        sourceHeaderRow: 12,
        rowHeaderLabel: "Transportation Types",
        columns: [
          structural("country", "Country", "C"),
          formula("shipments", "Number of shipments", "count", null, "D"),
          formula("cost", "Total costs, DKK", "total", "DKK", "E"),
        ],
        rows: [
          ...summaryRows(
            [
              "Belgium",
              "China",
              "Germany",
              "Estonia",
              "Finland",
              "France",
              "Indonesia",
              "Ireland",
              "Italy",
              "Lithuania",
              "Luxembourg",
              "Latvia",
              "Netherlands",
              "Norway",
              "Sweden",
              "Slovenia",
              "Vietnam",
            ],
            14,
          ),
          totalRow(31, "Total"),
        ],
      },
    ],
  },
  ...countrySheets.map((name): WorkbookSheet => {
    const extra = name === "DK-ID" || name === "DK-NO";
    return {
      name,
      role: "country-specific carrier price input",
      notes: [
        "Parcel distribution",
        "Please fill in all the price fields in column C, D, H and I",
        "Totals will be automatically calculated",
        'Vendor name is automatically transfered from the sheet "Total cost"',
      ],
      sections: [
        {
          key: "parcel-cost",
          title: "Table 1: Shipment information and cost",
          sourceHeaderRow: 13,
          rowHeaderLabel: "Weight",
          columns: priceColumns,
          rows: [...sourceRows(weightBands, 14), totalRow(32, "Total")],
        },
        {
          key: "additional-fees",
          title: "Additional fee",
          sourceHeaderRow: 36,
          rowHeaderLabel: "Additional fee",
          columns: [
            editable(
              "cost",
              "Cost (DKK)",
              "editable-currency",
              "fee",
              "DKK",
              "E",
            ),
          ],
          rows: feeRows(extra),
        },
      ],
    };
  }),
];

export const verifiedTemplateViews: readonly VerifiedTemplateView[] = [
  {
    id: "customer-bidding",
    title: "Customer bidding workbook",
    sheets: biddingSheets,
  },
  {
    id: "express-price",
    title: "Express price workbook",
    sheets: expressSheets,
  },
];

export function verifiedTemplateView(id: string): VerifiedTemplateView {
  const view = verifiedTemplateViews.find((item) => item.id === id);
  if (!view) throw new Error(`No verified view exists for ${id}.`);
  return view;
}
