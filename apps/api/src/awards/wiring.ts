// This file names the two things the award feature borrows from other features.
// The real versions are passed in when the server is built; tests pass fakes.
// Defaults refuse to work, so a missing connection can never award by accident.

import {
  type ComparisonResult,
  type ExcelTemplate,
  excelTemplateSchema,
  type Principal,
} from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { templatesFolder } from "../storage/paths.ts";

export type EvaluateTender = (
  deps: AppDeps,
  principal: Principal,
  tenderId: string,
) => Promise<ComparisonResult>;

export type FindAwardTemplate = (deps: AppDeps) => Promise<ExcelTemplate>;

export type AwardWiring = {
  evaluate: EvaluateTender;
  findAwardTemplate: FindAwardTemplate;
};

// Assumption: approved templates are JSON records in templates/. Not verified against live data.
export const findActiveAwardTemplate: FindAwardTemplate = async (deps) => {
  for (const name of await deps.store.list(templatesFolder)) {
    if (!name.endsWith(".json")) continue;
    const file = await deps.store.readJson(`${templatesFolder}/${name}`);
    const parsed = excelTemplateSchema.safeParse(file?.data);
    if (parsed.success && parsed.data.kind === "award") {
      if (parsed.data.status === "active") return parsed.data;
    }
  }
  throw new AppError("INVALID_STATE", "No approved award template is set up.");
};

export const defaultWiring: AwardWiring = {
  evaluate: async () => {
    throw new AppError("UNAVAILABLE", "The comparison is not connected yet.");
  },
  findAwardTemplate: findActiveAwardTemplate,
};
