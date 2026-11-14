# Microsoft 365 SharePoint storage

Freight file content is stored in the approved SharePoint document library through Microsoft Graph. The API never accepts a SharePoint URL from a browser and never sends a Graph credential or upload-session URL to the browser.

## Runtime configuration

The API needs these server-side settings:

- `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID` and `SHAREPOINT_CLIENT_SECRET` for the client-credentials flow.
- `SHAREPOINT_DRIVE_ID` and `SHAREPOINT_ROOT_ITEM_ID` for the approved document library and its root folder.
- `STORAGE_CURSOR_SECRET` for signing list cursors. `SESSION_SECRET` is only a local fallback.

The application registration should use the narrowest supported application permission, normally `Sites.Selected`, and the client administrator must grant the app access to the selected SharePoint site. Tenant-wide write permissions are not requested by this implementation.

The target list needs these columns (internal names can be configured in `SharePointStorageConfig.metadataFields`): `FreightOrganisationId`, `FreightOwnerId`, `FreightFileId`, `FreightDestination`, `FreightProcessingStatus`, `FreightRetentionHold` and `FreightRetentionUntil`. They are used for authorization and retention checks; folder names are not security boundaries.

## Storage flow

Logical destinations are allowlisted in `apps/api/src/storage/types.ts`. Folder creation walks from the configured root, finds exact child names by Graph item ID, and handles a concurrent create conflict by resolving the existing folder. Uploads use a server-held Graph upload session and contiguous `Content-Range` chunks. On completion the API writes authorization metadata before returning the file reference. If metadata writing fails, it attempts to remove the orphaned item.

File actions first resolve the configured drive and stable item ID, retrieve SharePoint metadata, and verify both organisation and user permissions. Listing hides items belonging to another organisation or user. Deletion is additionally blocked by the configured retention fields.

Graph requests retry only throttling and transient 5xx responses with bounded exponential backoff and `Retry-After`. The API maps Graph permission, conflict, missing-file and throttling failures to safe client-facing errors.

## Authentication boundary

`createApiApp` accepts a `PrincipalResolver`. The default server resolver reads a principal populated by the application authentication middleware; with no authentication middleware configured it rejects all file actions with `401`. This fail-closed default is intentional. The resolver must be connected to the product's Entra/session middleware before production use and must supply the authenticated user, organisation, allowed destination keys and effective permissions. Destination keys are checked in addition to SharePoint metadata, so a user cannot select a different carrier or tender folder by changing request JSON.

There is no live tenant configuration in this repository, so Graph permission grants, SharePoint column names and real upload/download behaviour still require verification in a dedicated client test tenant.
