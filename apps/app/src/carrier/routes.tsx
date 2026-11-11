// This file lists the carrier screen routes. The shell mounts them and passes the chosen language.
import type { ReactElement } from "react";
import type { Locale } from "../i18n";
import { TenderDetail } from "./TenderDetail";
import { TenderList } from "./TenderList";

export type CarrierRoute = { path: string; element: ReactElement };

export function carrierRoutes(locale: Locale): CarrierRoute[] {
  return [
    { path: "/carrier/tenders", element: <TenderList locale={locale} /> },
    {
      path: "/carrier/tenders/:tenderId",
      element: <TenderDetail locale={locale} />,
    },
  ];
}
