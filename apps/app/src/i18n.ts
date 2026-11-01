export type Locale = "da" | "en";

const localeCopy = {
  da: {
    language: "Sprog",
    overview: "Overblik",
    upload: "Upload",
    compare: "Sammenlign",
    invoices: "Fakturakontrol",
    calculator: "Prisberegner",
    carriers: "Transportører",
    compareEyebrow: "Sammenlign tilbud",
    compareTitle: "Hvem skal køre denne forsendelse?",
    compareSubtitle: "Vælg den transportør, der passer bedst til dine krav.",
    from: "Fra",
    to: "Til",
    goods: "Gods",
    recommendation: "Vores anbefaling",
    recommendedReason:
      "Transportør A er billigst blandt dem, der leverer til tiden mindst 90 % af gangene.",
    seeProbability: "Se sandsynlighed",
    carrier: "Transportør",
    price: "Pris (DKK)",
    delivery: "Leveringstid",
    onTime: "Til tiden",
    invoiceAccuracy: "Fakturaer rigtige",
    choose: "Vælg",
    selected: "Valgt",
    cheapest: "Billigst",
    recommended: "Anbefalet",
    day: "dag",
    days: "dage",
    priceDelta: "mod billigste",
    calculationTitle: "Sådan er tallene beregnet",
    calculationText:
      "Pris beregnes ud fra transportørens egne zoner, målemetode og priser. Leveringstid og til tiden kommer fra faktiske tidligere forsendelser på samme rute.",
    sampleTitle: "Eksempeldata · sample data",
    sampleText:
      "Navne, priser og procenter på denne skærm er udfyldt til design. De erstattes af rigtige tal, når transportørerne har lagt deres priser ind.",
    viewCalculation: "Se beregning",
    selectionSaved: "Transportør A er valgt til denne forsendelse.",
    selectionSavedDetail:
      "Valget er gemt som kladde og kan ændres indtil afsendelse.",
  },
  en: {
    language: "Language",
    overview: "Overview",
    upload: "Upload",
    compare: "Compare",
    invoices: "Invoice control",
    calculator: "Price calculator",
    carriers: "Carriers",
    compareEyebrow: "Compare offers",
    compareTitle: "Which carrier should take this shipment?",
    compareSubtitle: "Choose the carrier that best fits your requirements.",
    from: "From",
    to: "To",
    goods: "Goods",
    recommendation: "Our recommendation",
    recommendedReason:
      "Carrier A is the cheapest option that arrives on time at least 90% of the time.",
    seeProbability: "See probability",
    carrier: "Carrier",
    price: "Price (DKK)",
    delivery: "Delivery time",
    onTime: "On time",
    invoiceAccuracy: "Invoice accuracy",
    choose: "Choose",
    selected: "Selected",
    cheapest: "Cheapest",
    recommended: "Recommended",
    day: "day",
    days: "days",
    priceDelta: "above cheapest",
    calculationTitle: "How the numbers are calculated",
    calculationText:
      "Price comes from each carrier's own zones, measurement method and rates. Delivery time and on-time rate come from actual past shipments on the same route.",
    sampleTitle: "Sample data · eksempeldata",
    sampleText:
      "Names, prices and percentages on this screen are filled in for the design. They will be replaced by real numbers when carriers add their rates.",
    viewCalculation: "View calculation",
    selectionSaved: "Carrier A is selected for this shipment.",
    selectionSavedDetail:
      "The selection is saved as a draft and can be changed before dispatch.",
  },
} as const;

export type Copy = (typeof localeCopy)[Locale];

export function getCopy(locale: Locale): Copy {
  return localeCopy[locale];
}
