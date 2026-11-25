import type { Copy, Locale } from "../../i18n";
import { formatDkk, SAMPLE_OFFERS, type SampleOffer } from "./sampleOffers";

type PreviewCopy = Pick<
  Copy,
  | "publicPreviewLabel"
  | "publicPreviewTitle"
  | "publicPreviewBadge"
  | "publicPreviewTabBasis"
  | "publicPreviewTabOffers"
  | "publicPreviewTabCompare"
  | "publicPreviewNote"
  | "publicPreviewIllustrativeLabel"
  | "publicPreviewEmptyNote"
  | "publicPreviewSignInHint"
  | "publicPreviewCoverage"
  | "publicPreviewAnnualPrice"
  | "publicInputDelivery"
  | "carrier"
>;

export function IllustrativeOfferPreview({
  copy,
  locale,
}: {
  copy: PreviewCopy;
  locale: Locale;
}) {
  return (
    <section
      className="motion-safe:animate-freight-float overflow-hidden rounded-2xl border border-white/10 bg-freight-paper text-freight-ink shadow-freight-preview lg:mt-12"
      aria-labelledby="public-preview-title"
    >
      <PreviewHeader copy={copy} />
      <PreviewTabs copy={copy} />
      <PreviewGrid copy={copy} locale={locale} />
      <PreviewNote copy={copy} />
    </section>
  );
}

function PreviewHeader({ copy }: { copy: PreviewCopy }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-freight-ink/10 px-6 py-6 sm:px-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-freight-muted">
          {copy.publicPreviewLabel}
        </p>
        <h2
          className="mt-2 font-display text-2xl tracking-tight sm:text-3xl"
          id="public-preview-title"
        >
          {copy.publicPreviewTitle}
        </h2>
      </div>
      <span className="shrink-0 rounded-full bg-freight-sand px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-freight-gold-dark">
        {copy.publicPreviewBadge}
      </span>
    </div>
  );
}

function PreviewTabs({ copy }: { copy: PreviewCopy }) {
  return (
    <div className="flex gap-7 border-b border-freight-ink/10 px-6 pt-4 text-sm text-freight-muted sm:px-7">
      <span className="border-b-2 border-freight-gold pb-4 font-semibold text-freight-ink">
        {copy.publicPreviewTabCompare}
      </span>
      <span className="pb-4">{copy.publicPreviewTabBasis}</span>
      <span className="pb-4">{copy.publicPreviewTabOffers}</span>
    </div>
  );
}

function PreviewGrid({ copy, locale }: { copy: PreviewCopy; locale: Locale }) {
  return (
    <div className="px-6 py-5 sm:px-7">
      <div className="grid grid-cols-[1.1fr_1.35fr_0.75fr_0.75fr] gap-2 border-b border-freight-ink/10 pb-3 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-freight-muted sm:gap-3 sm:text-[0.62rem] sm:tracking-[0.12em]">
        <span>{copy.carrier}</span>
        <span>{copy.publicPreviewAnnualPrice}</span>
        <span>{copy.publicPreviewCoverage}</span>
        <span>{copy.publicInputDelivery}</span>
      </div>
      <div className="divide-y divide-freight-ink/10">
        {SAMPLE_OFFERS.map((offer) => (
          <PreviewRow key={offer.carrier} offer={offer} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function PreviewRow({ offer, locale }: { offer: SampleOffer; locale: Locale }) {
  return (
    <div
      className={`grid grid-cols-[1.1fr_1.35fr_0.75fr_0.75fr] items-center gap-2 py-4 text-xs tabular-nums sm:gap-3 sm:text-sm ${offer.best ? "bg-freight-sand/80 font-semibold" : ""}`}
    >
      <span>{offer.carrier}</span>
      <span>{formatDkk(offer.annualPriceDkk, locale)}</span>
      <span>{offer.coveragePercent} %</span>
      <span>{offer.deliveryDays} d</span>
    </div>
  );
}

function PreviewNote({ copy }: { copy: PreviewCopy }) {
  return (
    <aside className="flex items-start gap-4 bg-freight-sand px-6 py-5 sm:px-7">
      <BalanceIcon />
      <div className="text-xs leading-5 text-freight-ink">
        <strong className="block">{copy.publicPreviewIllustrativeLabel}</strong>
        <span className="block">{copy.publicPreviewEmptyNote}</span>
        <span className="block">{copy.publicPreviewSignInHint}</span>
        <span className="block">{copy.publicPreviewNote}</span>
      </div>
    </aside>
  );
}

function BalanceIcon() {
  return (
    <svg
      className="h-7 w-7 shrink-0 text-freight-gold-dark"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4v16M6 7h12M4 20h16M6 7l-3 6a3 3 0 0 0 6 0L6 7ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
