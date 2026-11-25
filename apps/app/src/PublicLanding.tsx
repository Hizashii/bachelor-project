import { NavLink } from "react-router";
import { IllustrativeOfferPreview } from "./components/public/IllustrativeOfferPreview";
import {
  formatDkk,
  SAMPLE_OFFERS,
  type SampleOffer,
} from "./components/public/sampleOffers";
import type { Locale } from "./i18n";
import { getCopy } from "./i18n";

type LandingProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
};

type Copy = ReturnType<typeof getCopy>;

export function PublicLanding({ locale, onLocaleChange }: LandingProps) {
  const copy = getCopy(locale);
  return (
    <div className="min-h-screen overflow-hidden bg-freight-cream text-freight-ink">
      <Header copy={copy} locale={locale} onLocaleChange={onLocaleChange} />
      <main>
        <Hero copy={copy} locale={locale} />
        <Proof copy={copy} />
        <Solution copy={copy} locale={locale} />
        <Process copy={copy} />
        <Closing copy={copy} />
      </main>
    </div>
  );
}

function Header({
  copy,
  locale,
  onLocaleChange,
}: {
  copy: Copy;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <header className="bg-freight-night px-5 py-5 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <NavLink className="grid gap-1" to="/" aria-label={copy.publicHome}>
            <span className="font-display text-xl tracking-tight">
              {copy.publicCompany}
            </span>
            <span className="text-[0.58rem] font-semibold uppercase tracking-[0.25em] text-freight-gold">
              {copy.publicCompanyDescriptor}
            </span>
          </NavLink>
          <span
            className="hidden h-10 w-px bg-white/20 sm:block"
            aria-hidden="true"
          />
          <span className="hidden text-sm text-white/80 sm:block">
            Freight Desk
          </span>
        </div>
        <nav
          className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 text-sm text-white/80"
          aria-label={copy.publicNavigation}
        >
          <a className="transition-colors hover:text-white" href="#solution">
            {copy.publicNavSolution}
          </a>
          <a className="transition-colors hover:text-white" href="#process">
            {copy.publicNavProcess}
          </a>
          <a className="transition-colors hover:text-white" href="#contact">
            {copy.publicNavContact}
          </a>
          <LanguageSwitch
            copy={copy}
            locale={locale}
            onLocaleChange={onLocaleChange}
          />
          <NavLink
            className="rounded border border-freight-gold px-5 py-2.5 font-semibold text-freight-gold transition-colors hover:bg-freight-gold hover:text-freight-night"
            to="/login"
          >
            {copy.publicSignIn}
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function LanguageSwitch({
  copy,
  locale,
  onLocaleChange,
}: {
  copy: Copy;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <fieldset className="flex items-center gap-2 border-0 p-0">
      <legend className="sr-only">{copy.language}</legend>
      <button
        className={
          locale === "da"
            ? "font-semibold text-white"
            : "text-white/60 hover:text-white"
        }
        type="button"
        onClick={() => onLocaleChange("da")}
      >
        DA
      </button>
      <span className="text-white/40" aria-hidden="true">
        /
      </span>
      <button
        className={
          locale === "en"
            ? "font-semibold text-white"
            : "text-white/60 hover:text-white"
        }
        type="button"
        onClick={() => onLocaleChange("en")}
      >
        EN
      </button>
    </fieldset>
  );
}

function Hero({ copy, locale }: { copy: Copy; locale: Locale }) {
  return (
    <section className="relative overflow-hidden bg-freight-night px-5 pb-32 pt-16 text-white sm:px-8 sm:pt-20 lg:px-10 lg:pt-24">
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <div className="motion-safe:animate-freight-rise">
          <p className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-freight-gold">
            <span className="h-px w-8 bg-freight-gold" aria-hidden="true" />
            {copy.publicHeroEyebrow}
          </p>
          <h1 className="font-display text-[clamp(3.8rem,7.2vw,6.8rem)] leading-[0.9] tracking-[-0.05em] text-white">
            <span className="block">{copy.publicHeroLineOne}</span>
            <span className="block">{copy.publicHeroLineTwo}</span>
            <span className="block">{copy.publicHeroLineThree}</span>
            <em className="block text-freight-gold">
              {copy.publicHeroLineFour}
            </em>
          </h1>
          <p className="mt-9 max-w-[31rem] text-base leading-7 text-white/75 sm:text-lg">
            {copy.publicSubtitle}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-8">
            <a
              className="inline-flex min-h-13 items-center gap-4 rounded bg-freight-gold px-7 font-semibold text-freight-night transition-transform hover:-translate-y-0.5 hover:bg-freight-gold-hover"
              href="#solution"
            >
              {copy.publicActionSolution}
              <ArrowIcon />
            </a>
            <NavLink
              className="font-semibold text-white underline decoration-freight-gold underline-offset-4"
              to="/login"
            >
              {copy.publicSignIn}
            </NavLink>
          </div>
          <div className="mt-12 grid max-w-[34rem] gap-3 border-t border-white/20 pt-6 text-sm text-white/75 sm:grid-cols-2">
            <CheckItem text={copy.publicHeroPointOne} />
            <CheckItem text={copy.publicHeroPointTwo} />
            <CheckItem text={copy.publicHeroPointThree} />
          </div>
        </div>
        <IllustrativeOfferPreview copy={copy} locale={locale} />
      </div>
      <DottedPath />
    </section>
  );
}

function Proof({ copy }: { copy: Copy }) {
  return (
    <section className="border-y border-freight-gold/20 bg-freight-sand px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-5 text-sm text-freight-ink sm:grid-cols-[auto_repeat(3,1fr)] sm:items-center sm:gap-8">
        <p className="mb-0 text-xs font-bold uppercase tracking-[0.18em] text-freight-gold-dark">
          {copy.publicBarLabel}
        </p>
        <ProofPoint text={copy.publicBarOne} />
        <ProofPoint text={copy.publicBarTwo} />
        <ProofPoint text={copy.publicBarThree} />
      </div>
    </section>
  );
}

function ProofPoint({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="h-px w-7 bg-freight-gold" aria-hidden="true" />
      {text}
    </span>
  );
}

function Solution({ copy, locale }: { copy: Copy; locale: Locale }) {
  return (
    <section
      className="bg-freight-cream px-5 py-24 sm:px-8 sm:py-32 lg:px-10"
      id="solution"
    >
      <div className="mx-auto max-w-6xl">
        <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-freight-gold-dark">
          {copy.publicSolutionEyebrow}
        </p>
        <h2 className="max-w-6xl font-display text-[clamp(2.8rem,4.6vw,5rem)] leading-[0.96] tracking-[-0.05em]">
          {copy.publicSolutionTitle}
        </h2>
        <SolutionVisual copy={copy} locale={locale} />
        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          <Feature
            title={copy.publicFeatureOneTitle}
            text={copy.publicFeatureOneText}
          />
          <Feature
            title={copy.publicFeatureTwoTitle}
            text={copy.publicFeatureTwoText}
          />
          <Feature
            title={copy.publicFeatureThreeTitle}
            text={copy.publicFeatureThreeText}
          />
        </div>
      </div>
    </section>
  );
}

function SolutionVisual({ copy, locale }: { copy: Copy; locale: Locale }) {
  return (
    <div className="mt-20 grid items-center gap-7 lg:grid-cols-[1fr_auto_1fr]">
      <SpreadsheetVisual copy={copy} />
      <span
        className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-freight-night text-freight-gold"
        aria-hidden="true"
      >
        <ArrowIcon />
      </span>
      <ComparisonVisual copy={copy} locale={locale} />
    </div>
  );
}

function SpreadsheetVisual({ copy }: { copy: Copy }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-freight-ink/15 bg-white shadow-freight-card"
      role="img"
      aria-label={copy.publicWorkflowAria}
    >
      <div className="flex items-center gap-3 border-b border-freight-ink/10 px-5 py-4 text-sm font-semibold">
        <FileIcon />
        {copy.publicInputFile}
      </div>
      <div className="grid grid-cols-[2rem_1.2fr_1fr_1fr] text-xs">
        <span className="border-b border-r border-freight-ink/10 bg-freight-cream p-2" />
        <span className="border-b border-r border-freight-ink/10 bg-freight-cream p-2">
          A
        </span>
        <span className="border-b border-r border-freight-ink/10 bg-freight-cream p-2">
          B
        </span>
        <span className="border-b border-freight-ink/10 bg-freight-cream p-2">
          C
        </span>
        {SAMPLE_OFFERS.map((offer, index) => (
          <SpreadsheetRow key={offer.carrier} row={index + 1} offer={offer} />
        ))}
      </div>
      <div className="flex gap-6 border-t border-freight-ink/10 bg-freight-cream px-4 py-3 text-xs font-semibold text-freight-muted">
        <span className="bg-white px-3 py-2 text-freight-ink">
          {copy.publicPreviewTabBasis}
        </span>
        <span className="px-3 py-2">{copy.publicPreviewTabOffers}</span>
      </div>
    </div>
  );
}

function SpreadsheetRow({ row, offer }: { row: number; offer: SampleOffer }) {
  const cell = "border-b border-freight-ink/10 p-3 tabular-nums";
  return (
    <>
      <span className="border-b border-r border-freight-ink/10 bg-freight-cream p-3 text-center text-freight-muted">
        {row}
      </span>
      <span className={`${cell} border-r`}>{offer.carrier}</span>
      <span className={`${cell} border-r`}>{offer.annualPriceDkk}</span>
      <span className={cell}>{offer.deliveryDays}</span>
    </>
  );
}

function ComparisonVisual({ copy, locale }: { copy: Copy; locale: Locale }) {
  return (
    <div
      className="rounded-lg bg-freight-night p-6 text-white shadow-freight-dark-card"
      role="img"
      aria-label={copy.publicWorkflowAria}
    >
      <div className="flex items-start justify-between border-b border-white/15 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-freight-gold">
            {copy.publicOutputLabel}
          </p>
          <h3 className="mt-4 font-display text-2xl">
            {copy.publicOutputTitle}
          </h3>
        </div>
        <span className="text-xs text-white/60">{copy.publicOutputBasis}</span>
      </div>
      <div className="divide-y divide-white/15">
        {SAMPLE_OFFERS.map((offer) => (
          <ComparisonRow key={offer.carrier} offer={offer} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function ComparisonRow({
  offer,
  locale,
}: {
  offer: SampleOffer;
  locale: Locale;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-5 text-sm tabular-nums ${offer.best ? "best-row rounded bg-white/15 px-3 font-semibold" : ""}`}
    >
      <span className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${offer.best ? "bg-freight-gold" : "bg-white/30"}`}
        />
        {offer.carrier}
      </span>
      <span>{formatDkk(offer.annualPriceDkk, locale)}</span>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <article className="border-t border-freight-ink/20 pt-5">
      <h3 className="font-display text-2xl tracking-tight">{title}</h3>
      <p className="mt-3 max-w-sm text-sm leading-6 text-freight-muted">
        {text}
      </p>
    </article>
  );
}

function Process({ copy }: { copy: Copy }) {
  const steps = [
    [copy.publicStepOneTitle, copy.publicStepOneText],
    [copy.publicStepTwoTitle, copy.publicStepTwoText],
    [copy.publicStepThreeTitle, copy.publicStepThreeText],
  ];
  return (
    <section
      className="border-y border-freight-gold/20 bg-freight-sand px-5 py-24 sm:px-8 sm:py-28 lg:px-10"
      id="process"
    >
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-freight-gold-dark">
            {copy.publicProcessEyebrow}
          </p>
          <h2 className="max-w-md font-display text-[clamp(2.8rem,4.4vw,4.3rem)] leading-[0.96] tracking-[-0.05em]">
            {copy.publicProcessTitle}
          </h2>
        </div>
        <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-3">
          {steps.map(([title, text], index) => (
            <Step
              key={title}
              number={`0${index + 1}`}
              title={title}
              text={text}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article>
      <div className="flex items-center gap-4 border-t border-freight-ink/30 pt-4">
        <span className="font-display text-5xl leading-none text-freight-gold-dark">
          {number}
        </span>
        <span className="h-px flex-1 bg-freight-ink/25" />
      </div>
      <h3 className="mt-8 font-display text-2xl tracking-tight">{title}</h3>
      <p className="mt-4 text-sm leading-6 text-freight-muted">{text}</p>
    </article>
  );
}

function Closing({ copy }: { copy: Copy }) {
  return (
    <section
      className="bg-freight-night px-5 py-24 text-white sm:px-8 sm:py-28 lg:px-10"
      id="contact"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <div>
            <h2 className="max-w-none font-display text-[clamp(3rem,4.6vw,4.8rem)] leading-[0.95] tracking-[-0.05em] lg:whitespace-nowrap">
              {copy.publicCtaTitle}
            </h2>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/70">
              {copy.publicCtaText}
            </p>
          </div>
          <div className="flex items-center gap-8">
            <a
              className="inline-flex min-h-13 items-center gap-4 rounded bg-freight-gold px-7 font-semibold text-freight-night transition-transform hover:-translate-y-0.5 hover:bg-freight-gold-hover"
              href="mailto:hello@slinkert-aaroe.example"
            >
              {copy.publicContact}
              <ArrowIcon />
            </a>
            <NavLink
              className="font-semibold text-white underline decoration-freight-gold underline-offset-4"
              to="/login"
            >
              {copy.publicSignIn}
            </NavLink>
          </div>
        </div>
        <footer className="mt-24 flex flex-wrap items-end justify-between gap-6 border-t border-white/20 pt-8 text-sm text-white/70">
          <div className="flex items-center gap-5">
            <span className="font-display text-lg text-white">
              {copy.publicCompany}
            </span>
            <span className="h-7 w-px bg-white/20" />
            <span>Freight Desk</span>
          </div>
          <a
            className="underline decoration-freight-gold underline-offset-4"
            href="mailto:hello@slinkert-aaroe.example"
          >
            {copy.publicFooterContact}
          </a>
        </footer>
      </div>
    </section>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <CheckIcon />
      {text}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-freight-gold"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3 8.5 3.1 3L13 4.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-freight-gold-dark"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.5 2.5h5.3l3.7 3.7v11.3h-9z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M10.5 2.8v3.8h3.7M7.5 11h5M7.5 14h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 10h15M11 4l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DottedPath() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-40"
      viewBox="0 0 1440 150"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 110C180 50 240 125 420 112S680 45 850 66s270 90 380 55 130-8 210-38"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 10"
      />
      <circle cx="240" cy="100" r="4" fill="currentColor" />
      <circle cx="760" cy="64" r="4" fill="currentColor" />
      <circle cx="1210" cy="92" r="4" fill="currentColor" />
    </svg>
  );
}
