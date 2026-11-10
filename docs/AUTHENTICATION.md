# Freight Desk authentication and authorization

This document describes the authentication boundary implemented for the Freight Desk API.
It is intentionally separate from tender, pricing, calculator, and invoice workflows.

## Security model

Freight Desk uses a backend-for-frontend (BFF) flow:

1. The browser navigates to the API's `/auth/login` route.
2. The API starts the Microsoft Entra ID authorization-code flow with PKCE, state, and nonce.
3. Entra redirects to `/auth/callback`; the API exchanges the code and validates the ID token
   signature, issuer, audience, tenant, nonce, and MFA evidence.
4. The API resolves the Entra subject against its trusted server-side directory.
5. The browser receives only an opaque session cookie. Entra access or refresh tokens are never
   sent to or stored by the browser.

Sessions store only a server-side user ID, expiry, and CSRF token. The cookie is HttpOnly,
SameSite=Lax, and Secure when `COOKIE_SECURE=true` (required in production). Unsafe requests
must send `x-csrf-token` and an exact `Origin` matching `APP_ORIGIN`.

Roles and company membership come only from the trusted directory. Request bodies, query-string
role values, cookies other than the opaque session cookie, and browser storage cannot grant a role.
Carrier directory records must reference one of the validated carrier company IDs.

## Roles

| Role | Access boundary |
| --- | --- |
| `carrier` | The user's provisioned carrier company and resources explicitly shared with that company. |
| `consultant` | Consultancy workspace resources and invited carrier comparisons. |
| `master` | Administrative access across the consultancy workspace. |

`GET /api/me` returns the safe profile used by the web shell. It does not return Entra tokens or
directory administration data. API handlers should use `requireAuth`, `requireRole`, and the
resource helpers in `apps/api/src/auth/authorization.ts`.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Keep `AUTH_MODE=mock` and use a fictional `SESSION_SECRET` of at least 32 characters.
3. Run `npm install` and `npm run dev`.
4. Open the app on `http://localhost:5173` and select one of the three fictional identities.

The mock identities are defined in server code and are available only when `AUTH_MODE=mock`:

- `carrier.user@demo.freightdesk.test` → `carrier-blue-fjord`
- `consultant.user@demo.freightdesk.test` → `consultant`
- `master.user@demo.freightdesk.test` → `master`

These identities are anonymized fixtures, not credentials and not customer accounts.

## Microsoft Entra configuration

For a real environment, set `AUTH_MODE=entra` and configure the following server-only values:

```dotenv
AUTH_MODE=entra
COOKIE_SECURE=true
SESSION_SECRET=<random secret with at least 32 characters>
ENTRA_TENANT_ID=<Freight Desk resource tenant ID>
ENTRA_CLIENT_ID=<web app registration client ID>
ENTRA_CLIENT_SECRET=<server-side secret from the secret manager>
ENTRA_REDIRECT_URI=https://freight.example.invalid/auth/callback
ENTRA_POST_LOGOUT_REDIRECT_URI=https://freight.example.invalid/login
ENTRA_SCOPES=openid profile email
```

In the Microsoft Entra admin center:

1. Register a **Web** application in the Freight Desk resource tenant.
2. Add the exact HTTPS redirect URI and post-logout redirect URI. Do not register a wildcard URI.
3. Create a client secret only for the confidential server component and store it in the deployment
   secret manager. Never commit it or expose it as a `VITE_` value.
4. Use the tenant-specific v2.0 authority. The API discovers the authorization, token, issuer, and
   JWKS endpoints from the tenant's OpenID configuration document.
5. Provision an approved server-side directory record for each user. Map the Entra object ID (`oid`)
   and resource tenant (`tid`) to the internal user ID, role, and—only for carriers—validated
   `companyId`. Do not use a submitted company ID or a display email as the authorization source.
6. Replace the current in-memory directory with the approved durable directory implementation before
   production rollout. The `UserDirectory` interface is the boundary for that change.

## MFA enforcement and verification

MFA is enforced by Microsoft Entra Conditional Access; the API also rejects an Entra login unless
the validated ID token contains MFA evidence (`amr=mfa` or an MFA authentication context in `acr`).
The application cannot enroll or bypass MFA.

Recommended rollout:

1. Create a Conditional Access policy targeting the Freight Desk enterprise application and the
   intended users, with **Grant access → Require multifactor authentication** (or the approved
   authentication strength).
2. Exclude only emergency access/break-glass accounts needed to recover a policy mistake.
3. Start in **Report-only**, use What If and sign-in reports, and test a consultant, master, and
   carrier guest account.
4. Enable the policy after the report-only results are correct.
5. Verify each test sign-in in Entra sign-in logs and verify that the API creates a session only when
   the validated token contains the expected MFA evidence. A token without it must redirect with
   `mfa_required` and must not create a session.

Microsoft's Conditional Access guidance recommends report-only rollout and a baseline MFA policy;
see [Build Conditional Access policies](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-policies)
and [Require MFA for all users](https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-mfa-strength).

## External carrier B2B onboarding

Freight Desk should use B2B collaboration in the resource tenant rather than creating passwords for
carrier users:

1. A master/approved user administrator creates an invitation for a named carrier user, or the
   onboarding service uses the Microsoft Graph invitation API after the carrier company has been
   approved in Freight Desk.
2. The invitee redeems the invitation with the identity from their home tenant. The resulting guest
   object in the Freight Desk tenant is the identity used by the application.
3. An administrator assigns the guest to the Freight Desk application or approved carrier group and
   creates the matching trusted directory record with `role=carrier` and the approved carrier company
   ID.
4. The carrier user completes the Conditional Access MFA requirement before the first session.
5. Offboarding disables the guest, removes the app/group assignment, deactivates the directory
   record, and revokes active Freight Desk sessions.

Required tenant controls:

- restrict guest invitations to approved administrator roles;
- restrict allowed collaboration domains to approved carrier domains;
- review inbound and outbound cross-tenant access settings;
- limit guest directory visibility;
- assign only the Freight Desk enterprise application and least-privilege groups;
- monitor guest sign-ins and invitation redemption; and
- retain an emergency access account outside the MFA policy.

See Microsoft's [B2B collaboration invitation guidance](https://learn.microsoft.com/en-us/entra/external-id/add-users-administrator)
and [external collaboration settings](https://learn.microsoft.com/en-us/entra/external-id/external-collaboration-settings-configure).

## Verification checklist

- Unauthenticated `GET /api/me` returns `401`.
- A mock sign-in creates a cookie with HttpOnly and SameSite attributes; production sets Secure.
- `GET /api/me` returns the server-derived role and carrier company only.
- A carrier cannot access another carrier company's guarded resource.
- A carrier cannot reach master-only routes, even if a request body contains `role=master`.
- Missing, wrong-origin, or incorrect CSRF headers reject logout and future unsafe routes.
- An expired server-side session returns `401` and is removed from the session store.
- An Entra callback with a stale state, wrong nonce, wrong issuer/audience/tenant, invalid signature,
  or missing MFA evidence creates no session.
- Browser devtools show no Graph, SharePoint, access-token, or refresh-token storage.

Microsoft's [authorization code flow guidance](https://learn.microsoft.com/en-us/entra/identity-platform/v2-app-types)
and [token validation guidance](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
are the protocol references for the BFF implementation.
