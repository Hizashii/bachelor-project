import type { MatrixImport } from "@freight-desk/shared";
import { useState } from "react";
import { apiFetch } from "../../api/client";
import type { Copy } from "../../i18n";

type FileChange = { currentTarget: { files: FileList | null } };
const MAX_QUESTIONS_SHOWN = 20;

type TariffImportProps = {
  copy: Copy;
  fileName: string | null;
  onImported: (grid: MatrixImport, fileName: string) => void;
};

export function TariffImport({
  copy,
  fileName,
  onImported,
}: TariffImportProps) {
  const [questions, setQuestions] = useState<MatrixImport["ambiguities"]>([]);
  const [error, setError] = useState<string | null>(null);
  const label = {
    blank_rate: copy.importBlank,
    unreadable_rate: copy.importUnreadable,
    unreadable_bracket: copy.importBracket,
    no_postcode_range: copy.importZone,
  };

  async function read(file: File) {
    setError(null);
    try {
      const grid = await apiFetch<MatrixImport>(
        `/api/tariffs/import?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: file,
        },
      );
      setQuestions(grid.ambiguities);
      onImported(grid, file.name);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : copy.draftSaveFailed,
      );
    }
  }

  return (
    <section className="excel-upload white-card">
      <div>
        <h2>{copy.uploadExisting}</h2>
        <p>
          {fileName
            ? `${copy.uploadedFile}: ${fileName}`
            : copy.uploadExistingDetail}
        </p>
        {error ? (
          <span className="upload-error" role="alert">
            {error}
          </span>
        ) : null}
        {questions.length > 0 ? (
          <div role="status">
            <strong>{copy.importQuestions}</strong>
            <ul>
              {questions.slice(0, MAX_QUESTIONS_SHOWN).map((item) => (
                <li key={`${item.row}-${item.column}`}>
                  {label[item.code]}:{" "}
                  {copy.rowColumn
                    .replace("{row}", String(item.row))
                    .replace("{column}", String(item.column))}{" "}
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <label className="button button-secondary" htmlFor="carrier-excel">
        {copy.uploadExcel}
      </label>
      <input
        id="carrier-excel"
        className="file-input"
        type="file"
        accept=".xlsx,.csv"
        onChange={(event: FileChange) => {
          const file = event.currentTarget.files?.[0];
          if (file) void read(file);
        }}
      />
    </section>
  );
}
