// Administrator screen: add carrier companies, invite users, hand out one-time links,
// and suspend or reactivate accounts. Nothing is deleted. Master role only.

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch, postJson } from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type Carrier = { id: string; displayName: string; status: string };
type Account = {
  id: string;
  email: string;
  displayName: string | null;
  role: "carrier" | "consultant" | "master";
  carrierId: string | null;
  status: "active" | "suspended";
};
type Copy = ReturnType<typeof getCopy>;
const JSON_HEADERS = { "content-type": "application/json" };

export function AdminUsers({ locale }: { locale: Locale }) {
  const copy = getCopy(locale);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [users, setUsers] = useState<Account[]>([]);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setCarriers(await apiFetch<Carrier[]>("/api/admin/carriers"));
    setUsers(await apiFetch<Account[]>("/api/admin/users"));
  }, []);
  useEffect(() => {
    void load().catch(() => setMessage(copy.requestFailed));
  }, [load, copy.requestFailed]);

  async function run(
    action: () => Promise<unknown>,
    linkOf?: (r: never) => string,
  ) {
    try {
      const result = await action();
      setLink(linkOf ? linkOf(result as never) : "");
      setMessage("");
      await load();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : copy.requestFailed,
      );
    }
  }

  return (
    <div className="screen admin-screen">
      <h1>{copy.usersAdmin}</h1>
      {message ? <p role="alert">{message}</p> : null}
      {link ? <LinkBox copy={copy} link={link} /> : null}
      <CarrierSection copy={copy} carriers={carriers} run={run} />
      <UserSection copy={copy} carriers={carriers} users={users} run={run} />
    </div>
  );
}

type Run = (
  action: () => Promise<unknown>,
  linkOf?: (result: never) => string,
) => Promise<void>;

function LinkBox({ copy, link }: { copy: Copy; link: string }) {
  return (
    <section
      className="white-card tender-workflow-card"
      aria-label={copy.oneTimeLink}
    >
      <h2>{copy.oneTimeLink}</h2>
      <p>{copy.oneTimeLinkHint}</p>
      <input
        readOnly
        aria-label={copy.oneTimeLink}
        value={link}
        onFocus={(e) => e.target.select()}
      />
    </section>
  );
}

function CarrierSection({
  copy,
  carriers,
  run,
}: {
  copy: Copy;
  carriers: Carrier[];
  run: Run;
}) {
  const [name, setName] = useState("");
  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="admin-carriers"
    >
      <h2 id="admin-carriers">{copy.carriers}</h2>
      <ul className="bid-status-list">
        {carriers.map((carrier) => (
          <li key={carrier.id}>
            <span>{carrier.displayName}</span>
            <span className="bid-waiting">{carrier.status}</span>
          </li>
        ))}
      </ul>
      <div className="comparison-actions">
        <label>
          {copy.companyName}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          className="button button-primary"
          type="button"
          disabled={!name.trim()}
          onClick={() =>
            void run(() =>
              postJson("/api/admin/carriers", {
                legalName: name.trim(),
                displayName: name.trim(),
              }),
            ).then(() => setName(""))
          }
        >
          {copy.addCarrier}
        </button>
      </div>
    </section>
  );
}

function UserSection({
  copy,
  carriers,
  users,
  run,
}: {
  copy: Copy;
  carriers: Carrier[];
  users: Account[];
  run: Run;
}) {
  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="admin-users"
    >
      <h2 id="admin-users">{copy.usersAdmin}</h2>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>{copy.email}</th>
            <th>{copy.role}</th>
            <th>{copy.status}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} copy={copy} user={user} run={run} />
          ))}
        </tbody>
      </table>
      <InviteForm copy={copy} carriers={carriers} run={run} />
    </section>
  );
}

function UserRow({ copy, user, run }: { copy: Copy; user: Account; run: Run }) {
  const next = user.status === "active" ? "suspended" : "active";
  const issue = (path: string) =>
    run(
      () => postJson(`/api/admin/users/${user.id}/${path}`, {}),
      (result: { link: string }) => result.link,
    );
  return (
    <tr>
      <td>{user.email}</td>
      <td>{user.role}</td>
      <td>{user.status}</td>
      <td>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void issue("invitation")}
        >
          {copy.newInvitation}
        </button>{" "}
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void issue("password-reset")}
        >
          {copy.resetPassword}
        </button>{" "}
        <button
          className="button button-secondary"
          type="button"
          onClick={() =>
            void run(() =>
              apiFetch(`/api/admin/users/${user.id}`, {
                method: "PATCH",
                headers: JSON_HEADERS,
                body: JSON.stringify({ status: next }),
              }),
            )
          }
        >
          {user.status === "active" ? copy.suspend : copy.reactivate}
        </button>
      </td>
    </tr>
  );
}

function InviteForm({
  copy,
  carriers,
  run,
}: {
  copy: Copy;
  carriers: Carrier[];
  run: Run;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Account["role"]>("carrier");
  const [carrierId, setCarrierId] = useState("");
  const body = {
    email: email.trim(),
    displayName: name.trim(),
    role,
    carrierId: role === "carrier" ? carrierId : undefined,
  };
  return (
    <div className="comparison-line">
      <label>
        {copy.email}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        {copy.name}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {copy.role}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Account["role"])}
        >
          <option value="carrier">carrier</option>
          <option value="consultant">consultant</option>
          <option value="master">master</option>
        </select>
      </label>
      <label>
        {copy.carrier}
        <select
          disabled={role !== "carrier"}
          value={carrierId}
          onChange={(e) => setCarrierId(e.target.value)}
        >
          <option value="" />
          {carriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.displayName}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button button-primary"
        type="button"
        disabled={
          !email.trim() || !name.trim() || (role === "carrier" && !carrierId)
        }
        onClick={() =>
          void run(
            () => postJson("/api/admin/users", body),
            (result: { invitationLink: string }) => result.invitationLink,
          ).then(() => {
            setEmail("");
            setName("");
          })
        }
      >
        {copy.inviteUser}
      </button>
    </div>
  );
}
