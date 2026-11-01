import { useState } from "react";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type PricingMethod = "fixed" | "weight" | "pallet" | "ldm" | "cbm";

type ZoneRow = {
  from: string;
  to: string;
  name: string;
};

type PriceRow = {
  band: string;
  values: string[];
};

type InputChange = {
  currentTarget: HTMLInputElement;
};

const initialZones: ZoneRow[] = [
  { from: "00", to: "26", name: "Zone 1" },
  { from: "30", to: "36", name: "Zone 2" },
  { from: "37", to: "39", name: "Zone 3" },
  { from: "40", to: "47", name: "Zone 4" },
  { from: "48", to: "49", name: "Zone 5" },
  { from: "50", to: "59", name: "Zone 6" },
  { from: "60", to: "67", name: "Zone 7" },
  { from: "68", to: "69", name: "Zone 8" },
];

const initialPrices: PriceRow[] = [
  {
    band: "1 til 50",
    values: ["0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00"],
  },
  {
    band: "51 til 100",
    values: ["0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00"],
  },
  {
    band: "101 til 200",
    values: ["0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00"],
  },
  {
    band: "201 til 300",
    values: ["0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00"],
  },
  {
    band: "301 til 500",
    values: ["0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00", "0,00"],
  },
];

type CarrierPortalProps = {
  locale: Locale;
};

export function CarrierPortal({ locale }: CarrierPortalProps) {
  const copy = getCopy(locale);
  const [method, setMethod] = useState<PricingMethod>("weight");
  const [zones, setZones] = useState<ZoneRow[]>(initialZones);
  const [prices, setPrices] = useState<PriceRow[]>(initialPrices);
  const [fileName, setFileName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const validation = validateZones(zones);

  function updateZone(index: number, field: keyof ZoneRow, value: string) {
    setSaved(false);
    setZones((current) =>
      current.map((zone, zoneIndex) =>
        zoneIndex === index ? { ...zone, [field]: value } : zone,
      ),
    );
  }

  function addZone() {
    setSaved(false);
    setZones((current) => [
      ...current,
      { from: "", to: "", name: `Zone ${current.length + 1}` },
    ]);
  }

  function updatePrice(rowIndex: number, zoneIndex: number, value: string) {
    setSaved(false);
    setPrices((current) =>
      current.map((row, index) => {
        if (index !== rowIndex) return row;
        const values = row.values.map((price, priceIndex) =>
          priceIndex === zoneIndex ? value : price,
        );
        return { ...row, values };
      }),
    );
  }

  function savePortal() {
    setSaved(true);
  }

  return (
    <div className="portal-screen">
      <section className="page-heading portal-heading">
        <p className="eyebrow">{copy.portalEyebrow}</p>
        <h1>{copy.portalTitleHeading}</h1>
        <p className="portal-subtitle">{copy.portalSubtitle}</p>
      </section>
      <ExcelUpload copy={copy} fileName={fileName} onUpload={setFileName} />
      <MethodStep
        copy={copy}
        method={method}
        onChange={(next) => {
          setMethod(next);
          setSaved(false);
        }}
      />
      <ZoneStep
        copy={copy}
        zones={zones}
        validation={validation}
        onChange={updateZone}
        onAdd={addZone}
      />
      <PriceStep
        copy={copy}
        zones={zones}
        prices={prices}
        method={method}
        onChange={updatePrice}
      />
      <div className="portal-footer">
        {saved ? <span className="saved-message">✓ {copy.saved}</span> : null}
        <button
          className="button button-primary"
          type="button"
          onClick={savePortal}
        >
          {copy.saveChanges}
        </button>
      </div>
    </div>
  );
}

function ExcelUpload({
  copy,
  fileName,
  onUpload,
}: {
  copy: Copy;
  fileName: string | null;
  onUpload: (name: string) => void;
}) {
  return (
    <section className="excel-upload white-card">
      <div>
        <h2>{copy.uploadExisting}</h2>
        <p>
          {fileName
            ? `${copy.uploadedFile}: ${fileName}`
            : copy.uploadExistingDetail}
        </p>
        {fileName ? (
          <span className="upload-status">✓ {copy.uploadPending}</span>
        ) : null}
      </div>
      <label className="button button-secondary" htmlFor="carrier-excel">
        {copy.uploadExcel}
      </label>
      <input
        id="carrier-excel"
        className="file-input"
        type="file"
        accept=".xlsx,.csv"
        onChange={(event: InputChange) => {
          const file = event.currentTarget.files?.[0];
          if (file) onUpload(file.name);
        }}
      />
    </section>
  );
}

function MethodStep({
  copy,
  method,
  onChange,
}: {
  copy: Copy;
  method: PricingMethod;
  onChange: (method: PricingMethod) => void;
}) {
  const methods: { id: PricingMethod; title: string; detail: string }[] = [
    { id: "fixed", title: copy.fixed, detail: copy.fixedDetail },
    { id: "weight", title: copy.weight, detail: copy.weightDetail },
    { id: "pallet", title: copy.pallet, detail: copy.palletDetail },
    { id: "ldm", title: copy.ldm, detail: copy.ldmDetail },
    { id: "cbm", title: copy.cbm, detail: copy.cbmDetail },
  ];

  return (
    <section className="portal-step">
      <StepHeading
        number="1"
        title={copy.pricingStep}
        hint={copy.pricingHint}
      />
      <div className="method-grid">
        {methods.map((item) => (
          <button
            key={item.id}
            className={`method-card ${method === item.id ? "active" : ""}`}
            type="button"
            onClick={() => onChange(item.id)}
          >
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type ZoneStepProps = {
  copy: Copy;
  zones: ZoneRow[];
  validation: ZoneValidation;
  onChange: (index: number, field: keyof ZoneRow, value: string) => void;
  onAdd: () => void;
};

function ZoneStep({ copy, zones, validation, onChange, onAdd }: ZoneStepProps) {
  return (
    <section className="portal-step">
      <StepHeading number="2" title={copy.zonesStep} hint={copy.zonesHint} />
      <div className="zone-layout">
        <div className="zone-card white-card">
          <div className="zone-header">
            <span>{copy.fromPostcode}</span>
            <span>{copy.toPostcode}</span>
            <span>{copy.zone}</span>
          </div>
          {zones.map((zone, index) => (
            <div className="zone-row" key={`${zone.name}-${zone.from}`}>
              <input
                aria-label={`${copy.fromPostcode} ${index + 1}`}
                value={zone.from}
                maxLength={2}
                inputMode="numeric"
                onChange={(event: InputChange) =>
                  onChange(index, "from", event.currentTarget.value)
                }
              />
              <input
                aria-label={`${copy.toPostcode} ${index + 1}`}
                value={zone.to}
                maxLength={2}
                inputMode="numeric"
                onChange={(event: InputChange) =>
                  onChange(index, "to", event.currentTarget.value)
                }
              />
              <input
                aria-label={`${copy.zone} ${index + 1}`}
                value={zone.name}
                onChange={(event: InputChange) =>
                  onChange(index, "name", event.currentTarget.value)
                }
              />
            </div>
          ))}
          <button
            className="button button-secondary add-row"
            type="button"
            onClick={onAdd}
          >
            + {copy.addRow}
          </button>
        </div>
        <ZoneValidation copy={copy} validation={validation} />
      </div>
    </section>
  );
}

function ZoneValidation({
  copy,
  validation,
}: {
  copy: Copy;
  validation: ZoneValidation;
}) {
  const messages = [
    [validation.noOverlaps, copy.noOverlaps],
    [validation.validRanges, copy.validRanges],
    [validation.allMapped, copy.allMapped],
  ] as const;

  return (
    <aside
      className={`validation-card ${validation.valid ? "valid" : "invalid"}`}
    >
      <h3>{copy.automaticCheck}</h3>
      {messages.map(([passed, text]) => (
        <p key={text} className={passed ? "check-pass" : "check-fail"}>
          <span className="validation-icon">{passed ? "✓" : "!"}</span>
          {text}
        </p>
      ))}
      {!validation.valid ? <small>{copy.zoneError}</small> : null}
    </aside>
  );
}

function StepHeading({
  number,
  title,
  hint,
}: {
  number: string;
  title: string;
  hint: string;
}) {
  return (
    <div className="step-heading">
      <span className="step-number">{number}</span>
      <h2>{title}</h2>
      <span className="step-hint">{hint}</span>
    </div>
  );
}

type ZoneValidation = {
  valid: boolean;
  noOverlaps: boolean;
  validRanges: boolean;
  allMapped: boolean;
};

function validateZones(zones: ZoneRow[]): ZoneValidation {
  const ranges = zones
    .map((zone) => ({ from: Number(zone.from), to: Number(zone.to) }))
    .filter((zone) => Number.isFinite(zone.from) && Number.isFinite(zone.to));
  const validRanges = zones.every(
    (zone) =>
      zone.from !== "" &&
      zone.to !== "" &&
      Number(zone.from) <= Number(zone.to),
  );
  const noOverlaps = ranges.every((range, index) =>
    ranges
      .slice(index + 1)
      .every((other) => range.to < other.from || other.to < range.from),
  );
  const allMapped = zones.every(
    (zone) => zone.from !== "" && zone.to !== "" && zone.name.trim() !== "",
  );
  return {
    valid: validRanges && noOverlaps && allMapped,
    noOverlaps,
    validRanges,
    allMapped,
  };
}

function PriceStep({
  copy,
  zones,
  prices,
  method,
  onChange,
}: {
  copy: Copy;
  zones: ZoneRow[];
  prices: PriceRow[];
  method: PricingMethod;
  onChange: (rowIndex: number, zoneIndex: number, value: string) => void;
}) {
  return (
    <section className="portal-step">
      <StepHeading
        number="3"
        title={`${copy.pricesStep} ${method === "weight" ? copy.weight.toLowerCase() : ""}`}
        hint={copy.pricesHint}
      />
      <div className="price-card white-card">
        <div className="price-grid-row price-grid-header">
          <span>{copy.weightBand}</span>
          {zones.map((zone) => (
            <span key={zone.name}>{zone.name}</span>
          ))}
        </div>
        {prices.map((row, rowIndex) => (
          <div className="price-grid-row" key={row.band}>
            <strong>{row.band}</strong>
            {row.values.map((value, zoneIndex) => (
              <input
                key={`${row.band}-${zones[zoneIndex]?.name ?? "zone"}`}
                aria-label={`${row.band} ${zones[zoneIndex]?.name ?? zoneIndex + 1}`}
                value={value}
                onChange={(event: InputChange) =>
                  onChange(rowIndex, zoneIndex, event.currentTarget.value)
                }
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
