import type { PriceShipment } from "@freight-desk/shared";
import { useState } from "react";
import { ActionBar, Field } from "../../components/OperationalUI";
import type { Copy } from "../../i18n";

type InputChange = { currentTarget: HTMLInputElement };
type Fields = {
  origin: string;
  destination: string;
  date: string;
  weight: string;
  pallets: string;
  ldm: string;
  cbm: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function toNumber(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

type ShipmentFormProps = {
  copy: Copy;
  busy: boolean;
  onCompare: (shipment: PriceShipment) => void;
};

export function ShipmentForm({ copy, busy, onCompare }: ShipmentFormProps) {
  const [fields, setFields] = useState<Fields>({
    origin: "",
    destination: "",
    date: today(),
    weight: "",
    pallets: "",
    ldm: "",
    cbm: "",
  });
  const field = (name: keyof Fields, label: string, type = "text") => (
    <Field label={label} htmlFor={`shipment-${name}`}>
      <input
        id={`shipment-${name}`}
        type={type}
        value={fields[name]}
        inputMode={type === "text" ? "decimal" : undefined}
        onChange={(event: InputChange) =>
          setFields({ ...fields, [name]: event.currentTarget.value })
        }
      />
    </Field>
  );

  return (
    <section
      className="white-card shipment-form"
      aria-label={copy.shipmentTitle}
    >
      <h2>{copy.shipmentTitle}</h2>
      <div className="terms-grid">
        {field("origin", copy.originPostcode)}
        {field("destination", copy.destinationPostcode)}
        {field("date", copy.collectionDate, "date")}
        {field("weight", copy.calcWeight)}
        {field("pallets", copy.calcPallets)}
        {field("ldm", copy.calcLdm)}
        {field("cbm", copy.calcCbm)}
      </div>
      <ActionBar>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={() =>
            onCompare({
              originPostcode: fields.origin.trim() || null,
              destinationPostcode: fields.destination.trim() || null,
              date: fields.date,
              weightKg: toNumber(fields.weight),
              pallets: toNumber(fields.pallets),
              loadingMeters: toNumber(fields.ldm),
              cubicMeters: toNumber(fields.cbm),
            })
          }
        >
          {busy ? copy.comparing : copy.runComparison}
        </button>
      </ActionBar>
    </section>
  );
}
