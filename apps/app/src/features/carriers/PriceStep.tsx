import { parseMinorUnits, type Tariff } from "@freight-desk/shared";
import type { Copy } from "../../i18n";
import { StepHeading } from "./StepHeading";
import { type EditorState, rateKey } from "./tariffDraft.ts";
import type { EditorAction } from "./tariffReducer.ts";

type InputChange = { currentTarget: HTMLInputElement };
type KeyPress = {
  key: string;
  preventDefault: () => void;
  currentTarget: HTMLInputElement;
};

const ARROW_STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
const MIN_RATE_COLUMN = "minmax(85px, 1fr)";

// Arrow up and down move to the same column in the next row, like a spreadsheet.
function moveFocus(event: KeyPress) {
  const step = ARROW_STEP[event.key];
  if (step === undefined) return;
  const { row, col } = event.currentTarget.dataset;
  const grid = event.currentTarget.closest(".price-card");
  const next = grid?.querySelector<HTMLInputElement>(
    `input[data-row="${Number(row) + step}"][data-col="${col}"]`,
  );
  if (!next) return;
  event.preventDefault();
  next.focus();
}

type PriceStepProps = {
  copy: Copy;
  state: EditorState;
  tariff: Tariff;
  unitLabel: string;
  dispatch: (action: EditorAction) => void;
};

export function PriceStep({
  copy,
  state,
  tariff,
  unitLabel,
  dispatch,
}: PriceStepProps) {
  const zoneCount = Math.max(tariff.zones.length, 1);
  const columns = `9.5rem repeat(${zoneCount}, ${MIN_RATE_COLUMN}) 5rem`;
  return (
    <section className="portal-step">
      <StepHeading
        number="3"
        title={`${copy.pricesStep} ${unitLabel}`}
        hint={copy.pricesHint}
      />
      <div className="price-card white-card">
        <div
          className="price-grid-row price-grid-header"
          style={{ gridTemplateColumns: columns }}
        >
          <span>{copy.upTo}</span>
          {tariff.zones.map((zone) => (
            <span key={zone.id}>{zone.name}</span>
          ))}
          <span className="sr-only">{copy.removeRow}</span>
        </div>
        {tariff.brackets.map((bracket, rowIndex) => (
          <div
            className="price-grid-row"
            style={{ gridTemplateColumns: columns }}
            // A band is identified by its position: its lower limit is the band above it.
            // biome-ignore lint/suspicious/noArrayIndexKey: bands have no other id
            key={rowIndex}
          >
            <input
              className="band-limit"
              aria-label={`${copy.upTo} ${rowIndex + 1}`}
              placeholder={copy.openEnded}
              value={state.limits[rowIndex] ?? ""}
              onChange={(event: InputChange) =>
                dispatch({
                  type: "limit",
                  index: rowIndex,
                  value: event.currentTarget.value,
                })
              }
            />
            {tariff.zones.map((zone, colIndex) => {
              const key = rateKey(zone.id, rowIndex);
              const text = state.rates[key] ?? "";
              const invalid =
                text.trim() !== "" && parseMinorUnits(text) === null;
              return (
                <input
                  key={zone.id}
                  data-row={rowIndex}
                  data-col={colIndex}
                  aria-label={`${bracket.from}–${bracket.to ?? "∞"} ${zone.name}`}
                  aria-invalid={invalid}
                  className={invalid ? "cell-invalid" : ""}
                  inputMode="decimal"
                  value={text}
                  onKeyDown={moveFocus}
                  onChange={(event: InputChange) =>
                    dispatch({
                      type: "rate",
                      key,
                      value: event.currentTarget.value,
                    })
                  }
                />
              );
            })}
            <button
              className="text-link"
              type="button"
              disabled={tariff.brackets.length === 1}
              onClick={() =>
                dispatch({ type: "removeBracket", index: rowIndex })
              }
            >
              {copy.removeRow}
            </button>
          </div>
        ))}
        <button
          className="button button-secondary add-row"
          type="button"
          onClick={() => dispatch({ type: "addBracket" })}
        >
          + {copy.addBracket}
        </button>
      </div>
    </section>
  );
}
