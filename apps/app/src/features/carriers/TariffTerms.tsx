import type { Copy } from "../../i18n";
import type { EditorState } from "./tariffDraft.ts";
import type { EditorAction } from "./tariffReducer.ts";

type InputChange = { currentTarget: HTMLInputElement };
type TermField = "fuelPercent" | "minimumCharge" | "effectiveFrom";

type TariffTermsProps = {
  copy: Copy;
  state: EditorState;
  dispatch: (action: EditorAction) => void;
};

export function TariffTerms({ copy, state, dispatch }: TariffTermsProps) {
  const field = (name: TermField, label: string, type = "text") => (
    <label className="terms-field">
      <span>{label}</span>
      <input
        type={type}
        inputMode={type === "text" ? "decimal" : undefined}
        value={state[name]}
        onChange={(event: InputChange) =>
          dispatch({
            type: "term",
            field: name,
            value: event.currentTarget.value,
          })
        }
      />
    </label>
  );
  return (
    <section className="portal-step">
      <h2>{copy.otherTerms}</h2>
      <div className="terms-grid white-card">
        {field("effectiveFrom", copy.effectiveFrom, "date")}
        {field("fuelPercent", copy.fuelSurcharge)}
        {field("minimumCharge", copy.minimumCharge)}
      </div>
    </section>
  );
}
