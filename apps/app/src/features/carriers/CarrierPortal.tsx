import type { PricingMethod } from "@freight-desk/shared";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { PriceStep } from "./PriceStep";
import { SampleCalculator } from "./SampleCalculator";
import { StepHeading } from "./StepHeading";
import { TariffImport } from "./TariffImport";
import { TariffTerms } from "./TariffTerms";
import { applyImport } from "./tariffDraft.ts";
import { useSession } from "./useSession";
import { type SaveStatus, useTariffEditor } from "./useTariffEditor";
import { ZoneStep } from "./ZoneStep";

type CarrierPortalProps = { locale: Locale };

function methodOptions(
  copy: Copy,
): { id: PricingMethod; title: string; detail: string }[] {
  return [
    { id: "per_shipment", title: copy.fixed, detail: copy.fixedDetail },
    { id: "per_100kg", title: copy.weight, detail: copy.weightDetail },
    { id: "per_pallet", title: copy.pallet, detail: copy.palletDetail },
    { id: "per_ldm", title: copy.ldm, detail: copy.ldmDetail },
    { id: "per_cbm", title: copy.cbm, detail: copy.cbmDetail },
  ];
}

export function CarrierPortal({ locale }: CarrierPortalProps) {
  const copy = getCopy(locale);
  const session = useSession();
  const editor = useTariffEditor(
    session?.organisationId ?? null,
    session?.userId ?? null,
  );
  const methods = methodOptions(copy);
  const unitLabel =
    methods
      .find((item) => item.id === editor.state.method)
      ?.title.toLowerCase() ?? "";
  const ratesMissing = editor.validation.errors.some(
    (error) => error.code === "missing_rate",
  );

  return (
    <div className="portal-screen">
      <section className="page-heading portal-heading">
        <p className="eyebrow">{copy.portalEyebrow}</p>
        <h1>{copy.portalTitleHeading}</h1>
        <p className="portal-subtitle">{copy.portalSubtitle}</p>
      </section>
      <TariffImport
        copy={copy}
        fileName={editor.state.sourceFile}
        onImported={(grid, name) =>
          editor.replace(applyImport(editor.state, grid, name))
        }
      />
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
              className={`method-card ${editor.state.method === item.id ? "active" : ""}`}
              type="button"
              onClick={() =>
                editor.dispatch({ type: "method", method: item.id })
              }
            >
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </div>
      </section>
      <ZoneStep
        copy={copy}
        rows={editor.state.zoneRows}
        validation={editor.validation}
        dispatch={editor.dispatch}
      />
      <PriceStep
        copy={copy}
        state={editor.state}
        tariff={editor.tariff}
        unitLabel={unitLabel}
        dispatch={editor.dispatch}
      />
      {ratesMissing ? (
        <p className="upload-error">{copy.ratesMissing}</p>
      ) : null}
      <TariffTerms
        copy={copy}
        state={editor.state}
        dispatch={editor.dispatch}
      />
      <SampleCalculator copy={copy} tariff={editor.tariff} />
      <PortalFooter
        copy={copy}
        status={editor.status}
        dirty={editor.dirty}
        signedIn={session !== null}
        canSubmit={editor.validation.complete && !editor.dirty}
        onSave={editor.saveDraft}
        onSubmit={editor.submit}
      />
    </div>
  );
}

type PortalFooterProps = {
  copy: Copy;
  status: SaveStatus;
  dirty: boolean;
  signedIn: boolean;
  canSubmit: boolean;
  onSave: () => void;
  onSubmit: () => void;
};

function PortalFooter({
  copy,
  status,
  dirty,
  signedIn,
  canSubmit,
  onSave,
  onSubmit,
}: PortalFooterProps) {
  const busy = status === "saving";
  return (
    <div className="portal-footer">
      {!signedIn ? (
        <span className="upload-error">{copy.signInNeeded}</span>
      ) : null}
      {dirty && signedIn ? (
        <span className="unsaved-message">{copy.unsavedChanges}</span>
      ) : null}
      {!dirty && status === "saved" ? (
        <span className="saved-message">✓ {copy.saved}</span>
      ) : null}
      {status === "submitted" ? (
        <span className="saved-message">✓ {copy.submittedOk}</span>
      ) : null}
      {status === "failed" ? (
        <span className="upload-error" role="alert">
          {copy.draftSaveFailed}
        </span>
      ) : null}
      <button
        className="button button-secondary"
        type="button"
        disabled={!signedIn || busy || !dirty}
        onClick={onSave}
      >
        {busy ? copy.savingNow2 : copy.saveDraft}
      </button>
      <button
        className="button button-primary"
        type="button"
        disabled={!signedIn || busy || !canSubmit}
        onClick={onSubmit}
      >
        {copy.submitForApproval}
      </button>
    </div>
  );
}
