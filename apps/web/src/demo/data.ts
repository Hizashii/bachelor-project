// This file contains fictional demo data only; it is not connected to a live backend.

export type TenderSummary = {
  id: string;
  name: string;
  customer: string;
  deadline: string;
  responses: string;
  status: "Open" | "Draft" | "Closed";
};

export type CompanySummary = {
  id: string;
  name: string;
  country: string;
  tenders: number;
  coverage: string;
  status: "Active" | "Review";
};

export type WorkspaceDemo = {
  stats: {
    activeTenders: number;
    invitedCarriers: number;
    responseRate: number;
    savingsOpportunity: string;
  };
  tenders: TenderSummary[];
  companies: CompanySummary[];
};

const workspaceDemo: WorkspaceDemo = {
  stats: {
    activeTenders: 12,
    invitedCarriers: 48,
    responseRate: 82,
    savingsOpportunity: "DKK 184k",
  },
  tenders: [
    {
      id: "tender-001",
      name: "Nordic Road Network 2027",
      customer: "Northstar Retail Group",
      deadline: "15 Jan 2027",
      responses: "8 / 12",
      status: "Open",
    },
    {
      id: "tender-002",
      name: "Benelux Parcel Flow",
      customer: "Bluebird Commerce",
      deadline: "22 Jan 2027",
      responses: "5 / 9",
      status: "Open",
    },
    {
      id: "tender-003",
      name: "Baltic Full Truckload",
      customer: "Oak & Pine Manufacturing",
      deadline: "Draft",
      responses: "—",
      status: "Draft",
    },
    {
      id: "tender-004",
      name: "Denmark Express Review",
      customer: "Cedar Homeware",
      deadline: "Closed 03 Dec 2026",
      responses: "11 / 11",
      status: "Closed",
    },
  ],
  companies: [
    {
      id: "carrier-001",
      name: "Blue Fjord Transport",
      country: "Denmark",
      tenders: 18,
      coverage: "Nordics · Benelux",
      status: "Active",
    },
    {
      id: "carrier-002",
      name: "Northwind Haulage",
      country: "Sweden",
      tenders: 14,
      coverage: "Nordics · Germany",
      status: "Active",
    },
    {
      id: "carrier-003",
      name: "Harborline Logistics",
      country: "Netherlands",
      tenders: 9,
      coverage: "Benelux · France",
      status: "Review",
    },
    {
      id: "carrier-004",
      name: "Silver Route A/S",
      country: "Denmark",
      tenders: 7,
      coverage: "Denmark · Germany",
      status: "Active",
    },
  ],
};

export async function loadWorkspaceDemo(): Promise<WorkspaceDemo> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  return workspaceDemo;
}
