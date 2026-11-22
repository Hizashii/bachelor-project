import {
  calculatePrice,
  formatMoney,
  type PriceFailure,
  type Tariff,
} from "@freight-desk/shared";
import { useMemo, useState } from "react";
import { Field } from "../../components/OperationalUI";
import type { Copy } from "../../i18n";

type InputChange = { currentTarget: HTMLInputElement };
type Inputs = {
  origin: string;
  destination: string;
  weight: string;
  pallets: string;
  ldm: string;
  cbm: string;
};

const EMPTY: Inputs = {
  origin: "",
  destination: "",
  weight: "",
  pallets: "",
  ldm: "",
  cbm: "",
};

function toNumber(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

const failureText: Record<PriceFailure, keyof Copy> = {
  outside_dates: "calcOutside_dates",
  missing_postcode: "calcMissing_postcode",
  origin_not_covered: "calcOrigin_not_covered",
  no_zone: "calcNo_zone",
  missing_quantity: "calcMissing_quantity",
  restriction_exceeded: "calcRestriction_exceeded",
  no_bracket: "calcNo_bracket",
  missing_rate: "calcMissing_rate",
};

export function SampleCalculator({
  copy,
  tariff,
}: {
  copy: Copy;
  tariff: Tariff;
}) {
  const [input, setInput] = useState<Inputs>(EMPTY);
  const result = useMemo(
    () =>
      calculatePrice(tariff, {
        originPostcode: input.origin || null,
        destinationPostcode: input.destination || null,
        date: new Date().toISOString().slice(0, 10),
        weightKg: toNumber(input.weight),
        pallets: toNumber(input.pallets),
        loadingMeters: toNumber(input.ldm),
        cubicMeters: toNumber(input.cbm),
      }),
    [tariff, input],
  );
  const field = (name: keyof Inputs, label: string) => (
    <Field label={label} htmlFor={`sample-${name}`}>
      <input
        id={`sample-${name}`}
        value={input[name]}
        inputMode="decimal"
        onChange={(event: InputChange) =>
          setInput({ ...input, [name]: event.currentTarget.value })
        }
      />
    </Field>
  );

  return (
    <section className="portal-step">
      <h2>{copy.calcTitle}</h2>
      <p>{copy.calcHint}</p>
      <div className="terms-grid white-card">
        {field("origin", copy.originPostcode)}
        {field("destination", copy.destinationPostcode)}
        {field("weight", copy.calcWeight)}
        {field("pallets", copy.calcPallets)}
        {field("ldm", copy.calcLdm)}
        {field("cbm", copy.calcCbm)}
      </div>
      <div className="calc-result" role="status">
        {result.status === "priced" ? (
          <>
            {result.lines.map((line) => (
              <p key={line.label}>
                <span>{line.label}</span>
                <span>{formatMoney(line.amountMinor, result.currency)}</span>
              </p>
            ))}
            <p className="calc-total">
              <strong>{copy.calcTotal}</strong>
              <strong>{formatMoney(result.totalMinor, result.currency)}</strong>
            </p>
          </>
        ) : (
          <p>{copy[failureText[result.reason]] as string}</p>
        )}
      </div>
    </section>
  );
}
