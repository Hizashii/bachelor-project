// This file exposes TypeScript models inferred from the shared schemas.

import type { z } from "zod";
import type {
  awardSchema,
  bidVersionSchema,
  carrierCompanySchema,
  deliveryTimeSchema,
  evaluationSchema,
  excelTemplateSchema,
  invitationSchema,
  moneySchema,
  offerStateSchema,
  postcodeRangeSchema,
  postcodeZoneSchema,
  quantitySchema,
  rateBandSchema,
  rateBasisSchema,
  serviceCoverageSchema,
  shipmentSchema,
  surchargeSchema,
  templateKindSchema,
  tenderSchema,
  tenderStatusSchema,
  transportUnitSchema,
  userMembershipSchema,
  userRoleSchema,
  vatTreatmentSchema,
} from "../schemas/business.ts";

export type UserRole = z.infer<typeof userRoleSchema>;
export type TenderStatus = z.infer<typeof tenderStatusSchema>;
export type OfferState = z.infer<typeof offerStateSchema>;
export type TransportUnit = z.infer<typeof transportUnitSchema>;
export type RateBasis = z.infer<typeof rateBasisSchema>;
export type VatTreatment = z.infer<typeof vatTreatmentSchema>;
export type TemplateKind = z.infer<typeof templateKindSchema>;
export type Money = z.infer<typeof moneySchema>;
export type DeliveryTime = z.infer<typeof deliveryTimeSchema>;
export type Quantity = z.infer<typeof quantitySchema>;
export type PostcodeRange = z.infer<typeof postcodeRangeSchema>;
export type PostcodeZone = z.infer<typeof postcodeZoneSchema>;
export type ServiceCoverage = z.infer<typeof serviceCoverageSchema>;
export type Surcharge = z.infer<typeof surchargeSchema>;
export type RateBand = z.infer<typeof rateBandSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type ExcelTemplate = z.infer<typeof excelTemplateSchema>;
export type CarrierCompany = z.infer<typeof carrierCompanySchema>;
export type UserMembership = z.infer<typeof userMembershipSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type Shipment = z.infer<typeof shipmentSchema>;
export type Tender = z.infer<typeof tenderSchema>;
export type BidVersion = z.infer<typeof bidVersionSchema>;
export type Award = z.infer<typeof awardSchema>;
