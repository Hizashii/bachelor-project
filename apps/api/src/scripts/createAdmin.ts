// Creates the first administrator. Run once with:
//   npm run admin:create -- name@example.com "Full Name"
// It prints a one-time link where the administrator chooses their password.

import { INVITATION_HOURS } from "../auth/service.ts";
import { loadApiEnvironment } from "../config/env.ts";
import { Accounts } from "../db/accounts.ts";
import { CredentialStore } from "../db/credentials.ts";
import { createDatabase, verifyDatabase } from "../db/pool.ts";

const [email, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(" ").trim();
const { DATABASE_URL, APP_ORIGIN } = loadApiEnvironment();
if (!email?.includes("@") || !displayName) {
  console.error('Usage: npm run admin:create -- name@example.com "Full Name"');
  process.exit(1);
}
const database = createDatabase(DATABASE_URL);
try {
  await verifyDatabase(database);
  const admin = await new Accounts(database).provisionAdministrator(
    email,
    displayName,
  );
  const token = await new CredentialStore(database).issueLink(
    admin.id,
    "invitation",
    INVITATION_HOURS,
  );
  console.log(
    `Administrator ${email} created. Open this link to choose a password:`,
  );
  console.log(
    new URL(`/accept-invitation?token=${token}`, APP_ORIGIN).toString(),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Could not create the administrator.",
  );
  process.exitCode = 1;
} finally {
  await database.end();
}
