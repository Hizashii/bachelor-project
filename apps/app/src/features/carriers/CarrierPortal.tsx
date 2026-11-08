import type {
  PricingUnit,
  RoadPriceList,
  ZoneRange,
} from "@freight-desk/shared";
import { validateZoneRanges } from "@freight-desk/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type PriceRow = {
  from: number;
  to: number | null;
  values: string[];
};

type CarrierPortalProps = {
  locale: Locale;
  onSubmit: (submission: RoadPriceList) => void;
};

type InputChange = { currentTarget: HTMLInputElement };

const initialZones: ZoneRange[] = [
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
  { from: 1, to: 50, values: emptyPrices() },
  { from: 51, to: 100, values: emptyPrices() },
  { from: 101, to: 200, values: emptyPrices() },
  { from: 201, to: 300, values: emptyPrices() },
  { from: 301, to: 500, values: emptyPrices() },
];

function emptyPrices(): string[] {
  return Array.from({ length: 8 }, () => "0,00");
}

export function CarrierPortal({ locale, onSubmit }: CarrierPortalProps) {
  const copy = getCopy(locale);
  const navigate = useNavigate();
  const [unit, setUnit] = useState<PricingUnit>("KG");
  const [zones, setZones] = useState<ZoneRange[]>(initialZones);
  const [prices, setPrices] = useState<PriceRow[]>(initialPrices);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const validation = useMemo(() => validateZoneRanges(zones), [zones]);

  function updateZone(index: number, field: keyof ZoneRange, value: string) {
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
        return {
          ...row,
          values: row.values.map((price, priceIndex) =>
            priceIndex === zoneIndex ? value : price,
          ),
        };
      }),
    );
  }

  function saveDraft() {
    setSaved(true);
    setSubmitError(false);
  }

  function submitPrices() {
    if (!validation.valid) {
      setSubmitError(true);
      return;
    }
    onSubmit({
      id: crypto.randomUUID(),
      carrierName: "Transportør A",
      unit,
      zones,
      priceBands: prices,
      submittedAt: new Date().toISOString(),
    });
    navigate("/carriers/sent");
  }

  return (
    <div className="portal-screen">
      <section className="page-heading portal-heading">
        <p className="eyebrow">{copy.portalEyebrow}</p>
        <h1>{copy.portalTitleHeading}</h1>
        <p className="portal-subtitle">{copy.portalSubtitle}</p>
        <span className="road-only-badge">{copy.roadOnly}</span>
      </section>
      <ExcelUpload
        copy={copy}
        fileName={fileName}
        uploadError={uploadError}
        onUpload={(name) => {
          if (!/\.(xlsx|csv)$/i.test(name)) {
            setFileName(null);
            setUploadError(true);
            return;
          }
          setFileName(name);
          setUploadError(false);
        }}
      />
      <MethodStep copy={copy} unit={unit} onChange={setUnit} />
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
        onChange={updatePrice}
      />
      {submitError ? <p className="form-error">{copy.zoneError}</p> : null}
      <div className="portal-footer">
        {saved ? <span className="saved-message">✓ {copy.saved}</span> : null}
        <button
          className="button button-secondary"
          type="button"
          onClick={saveDraft}
        >
          {copy.saveChanges}
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={submitPrices}
        >
          {copy.submitPrices}
        </button>
      </div>
    </div>
  );
}

function ExcelUpload({
  copy,
  fileName,
  uploadError,
  onUpload,
}: {
  copy: Copy;
  fileName: string | null;
  uploadError: boolean;
  onUpload: (name: string) => void;
}) {
  return (
    <section className="excel-upload white-card">
      <div>
        <h2>{copy.uploadExisting}</h2>
        {uploadError ? (
          <span className="form-error">{copy.uploadTypeError}</span>
        ) : null}
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
  unit,
  onChange,
}: {
  copy: Copy;
  unit: PricingUnit;
  onChange: (unit: PricingUnit) => void;
}) {
  const methods: { id: PricingUnit; title: string; detail: string }[] = [
    { id: "KG", title: copy.kg, detail: copy.kgDetail },
    { id: "CBM", title: copy.cbm, detail: copy.cbmDetail },
    { id: "LDM", title: copy.ldm, detail: copy.ldmDetail },
    { id: "PLL", title: copy.pll, detail: copy.pllDetail },
  ];

  return (
    <section className="portal-step">
      <StepHeading
        number="1"
        title={copy.pricingStep}
        hint={copy.pricingHint}
      />
      <div className="method-grid method-grid-four">
        {methods.map((item) => (
          <button
            key={item.id}
            className={`method-card ${unit === item.id ? "active" : ""}`}
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

function ZoneStep({
  copy,
  zones,
  validation,
  onChange,
  onAdd,
}: {
  copy: Copy;
  zones: ZoneRange[];
  validation: ReturnType<typeof validateZoneRanges>;
  onChange: (index: number, field: keyof ZoneRange, value: string) => void;
  onAdd: () => void;
}) {
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
            <div
              className="zone-row"
              key={`${zone.name}-${zone.from}-${zone.to}`}
            >
              <ZoneInput
                label={`${copy.fromPostcode} ${index + 1}`}
                value={zone.from}
                onChange={(value) => onChange(index, "from", value)}
              />
              <ZoneInput
                label={`${copy.toPostcode} ${index + 1}`}
                value={zone.to}
                onChange={(value) => onChange(index, "to", value)}
              />
              <ZoneInput
                label={`${copy.zone} ${index + 1}`}
                value={zone.name}
                onChange={(value) => onChange(index, "name", value)}
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

function ZoneInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={label}
      value={value}
      maxLength={2}
      inputMode="numeric"
      onChange={(event: InputChange) => onChange(event.currentTarget.value)}
    />
  );
}

function ZoneValidation({
  copy,
  validation,
}: {
  copy: Copy;
  validation: ReturnType<typeof validateZoneRanges>;
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

function PriceStep({
  copy,
  zones,
  prices,
  onChange,
}: {
  copy: Copy;
  zones: ZoneRange[];
  prices: PriceRow[];
  onChange: (rowIndex: number, zoneIndex: number, value: string) => void;
}) {
  return (
    <section className="portal-step">
      <StepHeading number="3" title={copy.pricesStep} hint={copy.pricesHint} />
      <div className="price-card white-card">
        <div className="price-grid-row price-grid-header">
          <span>{copy.weightBand}</span>
          {zones.map((zone) => (
            <span key={zone.name}>{zone.name}</span>
          ))}
        </div>
        {prices.map((row, rowIndex) => (
          <div className="price-grid-row" key={`${row.from}-${row.to}`}>
            <strong>
              {row.to ? `${row.from} til ${row.to}` : `${row.from}+`}
            </strong>
            {zones.map((zone, zoneIndex) => (
              <input
                key={`${row.from}-${zone.name}`}
                aria-label={`${row.from} ${row.to ?? "plus"} ${zone.name}`}
                value={row.values[zoneIndex] ?? ""}
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
