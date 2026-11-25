import {
  findTemplateVersion,
  type TemplateVersionBinding,
} from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import { StorageError } from "../storage/errors.ts";
import type { PrincipalDocuments } from "../storage/principalDocuments.ts";
import type {
  Principal,
  StorageDestination,
  StoredFile,
} from "../storage/types.ts";
import {
  TenderAccessError,
  TenderDraftConflictError,
  TenderDraftService,
  TenderDraftValidationError,
} from "./drafts.ts";

const staff: Principal = {
  userId: "staff-1",
  organizationId: "org-1",
  role: "staff",
  allowedDestinationKeys: ["*"],
  permissions: {
    readFiles: true,
    readOrganisationFiles: true,
    readTemplates: true,
    uploadFiles: true,
    deleteFiles: true,
    deleteOrganisationFiles: true,
  },
};

const carrierA: Principal = {
  ...staff,
  userId: "carrier-user-a",
  carrierId: "carrier-a",
  role: "carrier",
  allowedDestinationKeys: ["tenders/t1", "tenders/t2"],
  permissions: { ...staff.permissions, readOrganisationFiles: false },
};

const adminA: Principal = {
  ...staff,
  userId: "admin-a",
};

const adminB: Principal = {
  ...staff,
  userId: "admin-b",
};

describe("tender draft persistence boundary", () => {
  it("persists raw zero, keeps blank empty, and rejects stale revisions", async () => {
    const documents = new FakeDocuments();
    const service = new TenderDraftService(
      documents as unknown as PrincipalDocuments,
    );
    const binding = expressBinding();
    await service.configure(staff, "t1", {
      expressPriceTemplate: binding,
      invitedCarrierIds: ["carrier-a", "carrier-b"],
    });

    const empty = await service.getDraft(staff, "t1", "express-price");
    expect(empty).toMatchObject({ revision: 0, values: {} });

    const saved = await service.saveDraftForTender(staff, "t1", {
      templateId: "express-price",
      templateVersion: binding.templateVersion,
      sourceSha256: binding.sourceSha256,
      expectedRevision: 0,
      values: { "express-price|DK-BE|C14": "0" },
    });
    expect(saved.values["express-price|DK-BE|C14"]).toBe("0");
    expect(
      (await service.getDraft(staff, "t1", "express-price")).values[
        "express-price|DK-BE|C14"
      ],
    ).toBe("0");

    await expect(
      service.saveDraftForTender(staff, "t1", {
        templateId: "express-price",
        templateVersion: binding.templateVersion,
        sourceSha256: binding.sourceSha256,
        expectedRevision: 0,
        values: { "express-price|DK-BE|C14": "1" },
      }),
    ).rejects.toBeInstanceOf(TenderDraftConflictError);

    await expect(
      service.saveDraftForTender(staff, "t1", {
        templateId: "express-price",
        templateVersion: binding.templateVersion,
        sourceSha256: binding.sourceSha256,
        expectedRevision: 1,
        values: { "express-price|DK-BE|C14": "not-a-number" },
      }),
    ).rejects.toBeInstanceOf(TenderDraftValidationError);
  });

  it("does not share commercial drafts across owners or tenders", async () => {
    const documents = new FakeDocuments();
    const service = new TenderDraftService(
      documents as unknown as PrincipalDocuments,
    );
    const binding = expressBinding();
    await service.configure(staff, "t1", {
      expressPriceTemplate: binding,
      invitedCarrierIds: ["carrier-a", "carrier-b"],
    });
    await service.configure(staff, "t2", {
      expressPriceTemplate: binding,
      invitedCarrierIds: ["carrier-a"],
    });

    await service.saveDraftForTender(adminA, "t1", {
      templateId: "express-price",
      templateVersion: binding.templateVersion,
      sourceSha256: binding.sourceSha256,
      expectedRevision: 0,
      values: { "express-price|DK-BE|C14": "1,25" },
    });
    await service.saveDraftForTender(adminA, "t2", {
      templateId: "express-price",
      templateVersion: binding.templateVersion,
      sourceSha256: binding.sourceSha256,
      expectedRevision: 0,
      values: { "express-price|DK-BE|C14": "2,50" },
    });

    expect(
      (await service.getDraft(adminA, "t1", "express-price")).values[
        "express-price|DK-BE|C14"
      ],
    ).toBe("1,25");
    expect(
      (await service.getDraft(adminA, "t2", "express-price")).values[
        "express-price|DK-BE|C14"
      ],
    ).toBe("2,50");
    expect(
      (await service.getDraft(adminB, "t1", "express-price")).values,
    ).toEqual({});
    expect(
      (await service.getDraft(adminB, "t2", "express-price")).values,
    ).toEqual({});
  });

  it("lets an invited carrier price the express workbook but not see the bidding workbook", async () => {
    const documents = new FakeDocuments();
    const service = new TenderDraftService(
      documents as unknown as PrincipalDocuments,
    );
    const binding = expressBinding();
    await service.configure(staff, "t1", {
      biddingTemplate: biddingBinding(),
      expressPriceTemplate: binding,
      invitedCarrierIds: ["carrier-a"],
    });

    const templates = await service.getTemplates(carrierA, "t1");
    expect(templates.items.map((item) => item.template.kind)).toEqual([
      "express-price",
    ]);
    await expect(
      service.getDraft(carrierA, "t1", "customer-bidding"),
    ).rejects.toBeInstanceOf(TenderAccessError);
    const saved = await service.saveDraftForTender(carrierA, "t1", {
      templateId: "express-price",
      templateVersion: binding.templateVersion,
      sourceSha256: binding.sourceSha256,
      expectedRevision: 0,
      values: { "express-price|DK-DE|C14": "42" },
    });
    expect(saved.revision).toBe(1);
  });
});

function biddingBinding(): TemplateVersionBinding {
  const template = findTemplateVersion("customer-bidding", "1.0.0");
  if (!template) throw new Error("The bidding template is not registered.");
  return {
    templateId: template.id,
    templateVersion: template.version,
    sourceSha256: template.source.sha256,
  };
}

function expressBinding(): TemplateVersionBinding {
  const template = findTemplateVersion("express-price", "1.0.0");
  if (!template) throw new Error("The express template is not registered.");
  return {
    templateId: template.id,
    templateVersion: template.version,
    sourceSha256: template.source.sha256,
  };
}

class FakeDocuments {
  private readonly files: { file: StoredFile; body: string }[] = [];
  private sequence = 0;

  async putJson(
    principal: Principal,
    destination: StorageDestination,
    name: string,
    value: unknown,
  ): Promise<StoredFile> {
    if (
      this.files.some(
        (entry) =>
          entry.file.name === name &&
          sameDestination(entry.file.destination, destination),
      )
    ) {
      throw new StorageError("conflict", "duplicate");
    }
    const id = `file-${++this.sequence}`;
    const file: StoredFile = {
      id,
      driveId: "fake",
      name,
      contentType: "application/json",
      size: JSON.stringify(value).length,
      ownerId: principal.userId,
      organizationId: principal.organizationId,
      destination,
      uploadedAt: new Date(0).toISOString(),
      modifiedAt: new Date(0).toISOString(),
      processingStatus: "processed",
      versionId: String(this.sequence),
      eTag: id,
      retentionHold: false,
      retentionUntil: null,
    };
    this.files.push({ file, body: JSON.stringify(value) });
    return file;
  }

  async list(
    principal: Principal,
    destination: StorageDestination,
    prefix = "",
  ) {
    return this.files
      .filter(({ file }) => sameDestination(file.destination, destination))
      .filter(({ file }) => file.name.startsWith(prefix))
      .filter(({ file }) => file.organizationId === principal.organizationId)
      .filter(
        ({ file }) =>
          principal.permissions.readOrganisationFiles ||
          file.ownerId === principal.userId,
      )
      .map(({ file }) => file);
  }

  async listShared(
    principal: Principal,
    destination: StorageDestination,
    prefix: string,
  ) {
    return this.files
      .filter(({ file }) => sameDestination(file.destination, destination))
      .filter(({ file }) => file.name.startsWith(prefix))
      .filter(({ file }) => file.organizationId === principal.organizationId)
      .map(({ file }) => file);
  }

  async readJson(_principal: Principal, fileId: string) {
    return this.files.find(({ file }) => file.id === fileId)?.body
      ? JSON.parse(
          this.files.find(({ file }) => file.id === fileId)?.body ?? "null",
        )
      : null;
  }

  async readSharedJson(principal: Principal, fileId: string) {
    return this.readJson(principal, fileId);
  }
}

function sameDestination(left: StorageDestination, right: StorageDestination) {
  return left.kind === right.kind && left.kind !== "tender"
    ? true
    : left.kind === "tender" &&
        right.kind === "tender" &&
        left.tenderId === right.tenderId;
}
