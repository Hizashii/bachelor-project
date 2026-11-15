// Every change a carrier can make to the tariff on screen, as one small pure function.
// Not for saving or validating: see useTariffEditor.ts.

import type { PricingMethod } from "@freight-desk/shared";
import { type EditorState, newZoneRow, type ZoneRow } from "./tariffDraft.ts";

export type EditorAction =
  | { type: "method"; method: PricingMethod }
  | {
      type: "zoneField";
      id: string;
      field: keyof Omit<ZoneRow, "id">;
      value: string;
    }
  | { type: "addZone" }
  | { type: "removeZone"; id: string }
  | { type: "limit"; index: number; value: string }
  | { type: "addBracket" }
  | { type: "removeBracket"; index: number }
  | { type: "rate"; key: string; value: string }
  | {
      type: "term";
      field: "fuelPercent" | "minimumCharge" | "effectiveFrom";
      value: string;
    }
  | { type: "replace"; state: EditorState };

const WEIGHT_METHODS: PricingMethod[] = ["per_100kg", "per_shipment"];
const WEIGHT_LIMITS = ["50", "100", "200", "300", ""];

function changeMethod(state: EditorState, method: PricingMethod): EditorState {
  const untouched = Object.keys(state.rates).length === 0;
  if (!untouched) return { ...state, method };
  const limits = WEIGHT_METHODS.includes(method) ? [...WEIGHT_LIMITS] : [""];
  return { ...state, method, limits };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "method":
      return changeMethod(state, action.method);
    case "zoneField":
      return {
        ...state,
        zoneRows: state.zoneRows.map((row) =>
          row.id === action.id ? { ...row, [action.field]: action.value } : row,
        ),
      };
    case "addZone":
      return {
        ...state,
        zoneRows: [...state.zoneRows, newZoneRow(state.zoneRows.length + 1)],
      };
    case "removeZone":
      return {
        ...state,
        zoneRows: state.zoneRows.filter((row) => row.id !== action.id),
      };
    case "limit":
      return {
        ...state,
        limits: state.limits.map((v, i) =>
          i === action.index ? action.value : v,
        ),
      };
    case "addBracket":
      return { ...state, limits: [...state.limits, ""] };
    case "removeBracket":
      return removeBracket(state, action.index);
    case "rate":
      return {
        ...state,
        rates: { ...state.rates, [action.key]: action.value },
      };
    case "term":
      return { ...state, [action.field]: action.value };
    case "replace":
      return action.state;
  }
}

// Rates of the removed band are dropped and the bands below it move up by one.
function removeBracket(state: EditorState, index: number): EditorState {
  const rates: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.rates)) {
    const [zoneId = "", bracket = "0"] = key.split("|");
    const at = Number(bracket);
    if (at === index) continue;
    rates[`${zoneId}|${at > index ? at - 1 : at}`] = value;
  }
  return {
    ...state,
    limits: state.limits.filter((_, i) => i !== index),
    rates,
  };
}
