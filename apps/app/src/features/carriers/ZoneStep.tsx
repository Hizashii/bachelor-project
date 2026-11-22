import type { TariffValidation } from "@freight-desk/shared";
import type { Copy } from "../../i18n";
import { StepHeading } from "./StepHeading";
import type { ZoneRow } from "./tariffDraft.ts";
import type { EditorAction } from "./tariffReducer.ts";

type InputChange = { currentTarget: HTMLInputElement };
const POSTCODE_DIGITS = 4;

type ZoneStepProps = {
  copy: Copy;
  rows: ZoneRow[];
  validation: TariffValidation;
  dispatch: (action: EditorAction) => void;
};

export function ZoneStep({ copy, rows, validation, dispatch }: ZoneStepProps) {
  const edit =
    (id: string, field: "name" | "from" | "to") => (event: InputChange) =>
      dispatch({
        type: "zoneField",
        id,
        field,
        value: event.currentTarget.value,
      });

  return (
    <section className="portal-step">
      <StepHeading number="2" title={copy.zonesStep} hint={copy.zonesHint} />
      <div className="zone-layout">
        <div className="zone-card white-card">
          <div className="zone-header zone-row-editable">
            <span>{copy.fromPostcode}</span>
            <span>{copy.toPostcode}</span>
            <span>{copy.zone}</span>
            <span className="sr-only">{copy.removeRow}</span>
          </div>
          {rows.map((row, index) => (
            <div className="zone-row zone-row-editable" key={row.id}>
              <input
                aria-label={`${copy.fromPostcode} ${index + 1}`}
                value={row.from}
                maxLength={POSTCODE_DIGITS}
                inputMode="numeric"
                onChange={edit(row.id, "from")}
              />
              <input
                aria-label={`${copy.toPostcode} ${index + 1}`}
                value={row.to}
                maxLength={POSTCODE_DIGITS}
                inputMode="numeric"
                onChange={edit(row.id, "to")}
              />
              <input
                aria-label={`${copy.zone} ${index + 1}`}
                value={row.name}
                onChange={edit(row.id, "name")}
              />
              <button
                className="text-link"
                type="button"
                disabled={rows.length === 1}
                onClick={() => dispatch({ type: "removeZone", id: row.id })}
              >
                {copy.removeRow}
              </button>
            </div>
          ))}
          <button
            className="button button-secondary add-row"
            type="button"
            onClick={() => dispatch({ type: "addZone" })}
          >
            + {copy.addRow}
          </button>
        </div>
        <ZoneChecks copy={copy} rows={rows} validation={validation} />
      </div>
    </section>
  );
}

type ZoneChecksProps = {
  copy: Copy;
  rows: ZoneRow[];
  validation: TariffValidation;
};

function ZoneChecks({ copy, rows, validation }: ZoneChecksProps) {
  const codes = validation.errors.map((error) => error.code);
  const checks = [
    [
      !codes.includes("overlap") && !codes.includes("duplicate_range"),
      copy.noOverlaps,
    ],
    [
      !codes.includes("invalid_range") && !codes.includes("reversed_range"),
      copy.validRanges,
    ],
    [
      rows.every((row) => row.from.trim() !== "" && row.name.trim() !== ""),
      copy.allMapped,
    ],
  ] as const;
  const allPassed = checks.every(([passed]) => passed);
  const gaps = validation.warnings.find(
    (warning) => warning.code === "postcode_gaps",
  );

  return (
    <aside className={`validation-card ${allPassed ? "valid" : "invalid"}`}>
      <h3>{copy.automaticCheck}</h3>
      {checks.map(([passed, text]) => (
        <p key={text} className={passed ? "check-pass" : "check-fail"}>
          <span className="validation-icon">{passed ? "✓" : "!"}</span>
          {text}
        </p>
      ))}
      {gaps?.code === "postcode_gaps" ? (
        <small>
          {copy.postcodeGaps.replace("{count}", String(gaps.gaps.length))}
        </small>
      ) : null}
      {allPassed ? null : <small>{copy.zoneError}</small>}
    </aside>
  );
}
