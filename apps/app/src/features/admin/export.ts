import type { CarrierSubmission } from "../../data";

export async function downloadRoadWorkbook(
  submissions: readonly CarrierSubmission[],
): Promise<void> {
  const response = await fetch("/api/exports/road", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissions: submissions.map(toExportSubmission) }),
  });
  if (!response.ok) throw new Error("The Excel export could not be created.");

  const blob = await response.blob();
  const filename = getFilename(submissions);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toExportSubmission(submission: CarrierSubmission) {
  const {
    status: _status,
    hasZoneWarning: _hasZoneWarning,
    ...roadPriceList
  } = submission;
  return roadPriceList;
}

function getFilename(submissions: readonly CarrierSubmission[]): string {
  if (submissions.length !== 1) {
    return "Prisskabelon - Road - DK-DK - alle transportører.xlsx";
  }
  return `Prisskabelon - Road - DK-DK - ${submissions[0].carrierName}.xlsx`;
}
