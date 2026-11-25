import type {
  WorkbookCellKind,
  WorkbookColumn,
  WorkbookSection,
  WorkbookSheet,
} from "@freight-desk/shared";

export type WorkbookTableProps = {
  templateId: string;
  sheet: WorkbookSheet;
  values: Record<string, string | null>;
  errors: Record<string, string>;
  onChange: (cellId: string, value: string) => void;
  onBlur: (cellId: string, kind: WorkbookCellKind) => void;
};

export function WorkbookTable({
  templateId,
  sheet,
  values,
  errors,
  onChange,
  onBlur,
}: WorkbookTableProps) {
  return (
    <div className="workbook-table-scroll">
      {sheet.notes ? (
        <div className="workbook-source-notes">
          {sheet.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
      <div className="workbook-table-stack">
        {sheet.sections.map((section) => (
          <div key={section.key}>
            <WorkbookSectionTable
              templateId={templateId}
              sheet={sheet}
              section={section}
              values={values}
              errors={errors}
              onChange={onChange}
              onBlur={onBlur}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkbookSectionTable({
  templateId,
  sheet,
  section,
  values,
  errors,
  onChange,
  onBlur,
}: WorkbookTableProps & { section: WorkbookSection }) {
  const groups = groupedColumns(section.columns);
  return (
    <section
      className="workbook-section"
      aria-labelledby={`${templateId}-${sheet.name}-${section.key}`}
    >
      <div className="workbook-section-heading">
        <h3 id={`${templateId}-${sheet.name}-${section.key}`}>
          {section.title}
        </h3>
        {section.sourceHeaderRow ? (
          <span>Source row {section.sourceHeaderRow}</span>
        ) : null}
      </div>
      <table className="workbook-table">
        <thead>
          {groups.some((group) => group.label) ? (
            <tr className="workbook-group-row">
              <th
                className="workbook-identifying-column"
                rowSpan={2}
                scope="col"
              >
                {section.rowHeaderLabel ?? "Structure"}
              </th>
              {groups.map((group) => (
                <th
                  key={group.key}
                  colSpan={group.columns.length}
                  scope="colgroup"
                >
                  {group.label}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            {!groups.some((group) => group.label) ? (
              <th className="workbook-identifying-column" scope="col">
                {section.rowHeaderLabel ?? "Structure"}
              </th>
            ) : null}
            {section.columns.map((column) => (
              <th key={column.key} scope="col">
                <span>{column.label}</span>
                <small>{columnMeta(column)}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr
              className={row.kind === "total" ? "workbook-total-row" : ""}
              key={row.key}
            >
              <th className="workbook-identifying-column" scope="row">
                <span>{row.label}</span>
                <small>Row {row.sourceRow}</small>
              </th>
              {section.columns.map((column) => {
                const cellId = makeCellId(
                  templateId,
                  sheet.name,
                  column,
                  row.sourceRow,
                );
                const kind = effectiveKind(row.kind, column.kind);
                return (
                  <td
                    className={
                      kind === "structural" || kind === "formula"
                        ? "workbook-readonly-cell"
                        : ""
                    }
                    key={column.key}
                  >
                    {kind === "structural" || kind === "formula" ? (
                      <span
                        className={`workbook-readonly-value ${kind === "formula" ? "workbook-formula-cell" : "workbook-structural-cell"}`}
                        role="img"
                        aria-label={
                          kind === "formula"
                            ? `${sheet.name} ${row.label} ${column.label}: formula result not calculated`
                            : `${sheet.name} ${row.label} ${column.label}: structural value`
                        }
                      >
                        {kind === "structural"
                          ? (row.structuralValues?.[column.key] ?? "")
                          : ""}
                      </span>
                    ) : (
                      <>
                        <input
                          aria-label={cellLabel(sheet, row.label, column)}
                          aria-invalid={errors[cellId] ? true : undefined}
                          className={`workbook-input ${isNumeric(kind) ? "numeric-input" : ""}`}
                          inputMode={isNumeric(kind) ? "decimal" : "text"}
                          type="text"
                          value={values[cellId] ?? ""}
                          onBlur={() => onBlur(cellId, kind)}
                          onChange={(event: {
                            currentTarget: HTMLInputElement;
                          }) => onChange(cellId, event.currentTarget.value)}
                        />
                        {errors[cellId] ? (
                          <span className="workbook-cell-error" role="alert">
                            {errors[cellId]}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function groupedColumns(columns: WorkbookColumn[]) {
  const groups: { key: string; label: string; columns: WorkbookColumn[] }[] =
    [];
  for (const column of columns) {
    const label = column.group ?? "";
    const previous = groups.at(-1);
    if (previous?.label === label) previous.columns.push(column);
    else
      groups.push({ key: `${label}-${column.key}`, label, columns: [column] });
  }
  return groups;
}

function effectiveKind(
  rowKind: "matrix" | "total" | "structural" | undefined,
  columnKind: WorkbookCellKind,
): WorkbookCellKind {
  if (rowKind === "total" && columnKind.startsWith("editable"))
    return "formula";
  return columnKind;
}

function isNumeric(kind: WorkbookCellKind): boolean {
  return kind === "editable-decimal" || kind === "editable-currency";
}

function makeCellId(
  templateId: string,
  sheetName: string,
  column: WorkbookColumn,
  sourceRow: number,
): string {
  return `${templateId}|${sheetName}|${column.sourceColumn ?? column.key}${sourceRow}`;
}

function cellLabel(
  sheet: WorkbookSheet,
  rowLabel: string,
  column: WorkbookColumn,
): string {
  const details = [sheet.name, rowLabel, column.label];
  if (column.unit) details.push(column.unit);
  if (column.currency) details.push(column.currency);
  return details.join(" — ");
}

function columnMeta(column: WorkbookColumn): string {
  if (column.currency) return column.currency;
  if (column.unit) return column.unit;
  if (column.kind === "formula") return "formula";
  if (column.kind === "structural") return "fixed";
  return "input";
}
