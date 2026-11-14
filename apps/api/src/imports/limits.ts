// Size and speed limits for uploaded spreadsheets. Values can be tuned per environment.
// Not for business rules.

const BYTES_PER_MEGABYTE = 1024 * 1024;

function fromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const importLimits = {
  maxFileBytes: fromEnv("IMPORT_MAX_FILE_MB", 100) * BYTES_PER_MEGABYTE,
  maxRows: fromEnv("IMPORT_MAX_ROWS", 500_000),
  maxSheetColumns: fromEnv("IMPORT_MAX_COLUMNS", 200),
  maxConcurrentJobs: fromEnv("IMPORT_MAX_CONCURRENT_JOBS", 2),
  maxAttempts: fromEnv("IMPORT_MAX_ATTEMPTS", 3),
  retentionMinutes: fromEnv("IMPORT_RETENTION_MINUTES", 30),
  headerSearchRows: 20,
  previewRows: 50,
};
