import { SHIPMENT_FIELDS } from "@freight-desk/shared";
import type { Copy } from "../../i18n";
import type { ColumnMapping, FileInspection, ShipmentField } from "./types";

type SelectChange = { currentTarget: HTMLSelectElement };

type MappingTableProps = {
  copy: Copy;
  inspection: FileInspection;
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
};

export function MappingTable({
  copy,
  inspection,
  mapping,
  onChange,
}: MappingTableProps) {
  function choose(field: ShipmentField, value: string) {
    const next = { ...mapping };
    if (value === "") delete next[field];
    else next[field] = Number(value);
    onChange(next);
  }

  return (
    <div className="mapping-table white-card">
      {SHIPMENT_FIELDS.map((field) => (
        <label className="mapping-row" key={field}>
          <span>
            {copy.fieldNames[field]}
            {inspection.uncertain.includes(field) ? (
              <em className="mapping-flag">{copy.needsCheck}</em>
            ) : null}
          </span>
          <select
            value={mapping[field] === undefined ? "" : String(mapping[field])}
            onChange={(event: SelectChange) =>
              choose(field, event.currentTarget.value)
            }
          >
            <option value="">{copy.notInFile}</option>
            {inspection.headers.map((header, index) => (
              // Column position is the stable identity of a spreadsheet column.
              // biome-ignore lint/suspicious/noArrayIndexKey: columns have no other id
              <option key={index} value={String(index)}>
                {header || `(${index + 1})`}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
