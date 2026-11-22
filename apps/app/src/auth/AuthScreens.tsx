import { type ReactNode, useEffect, useState } from "react";
import { postPublic, useAuth } from "./auth";

type InputChange = { currentTarget: HTMLInputElement };
type FormSubmit = { preventDefault: () => void };

const MIN_PASSWORD_LENGTH = 12;

type CardProps = { title: string; intro: string; children: ReactNode };

function Card({ title, intro, children }: CardProps) {
  return (
    <main className="auth-screen">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Freight Desk</p>
        <h1 id="login-title">{title}</h1>
        <p className="auth-lede">{intro}</p>
        {children}
      </section>
    </main>
  );
}

type FieldProps = {
  label: string;
  type: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
};

function Field({ label, type, value, autoComplete, onChange }: FieldProps) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        required
        onChange={(event: InputChange) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function useForm(send: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormSubmit) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

type FormBodyProps = {
  form: ReturnType<typeof useForm>;
  button: string;
  children: ReactNode;
};

function FormBody({ form, button, children }: FormBodyProps) {
  return (
    <form onSubmit={form.submit}>
      {form.error ? (
        <p className="auth-error" role="alert">
          {form.error}
        </p>
      ) : null}
      {children}
      <button
        className="button button-primary auth-submit"
        type="submit"
        disabled={form.busy}
      >
        {button}
      </button>
    </form>
  );
}

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const form = useForm(() => login(email, password));
  return (
    <Card
      title="Log in"
      intro="Use the e-mail address and password for your Freight Desk account."
    >
      <FormBody form={form} button="Log in">
        <Field
          label="E-mail"
          type="email"
          value={email}
          autoComplete="username"
          onChange={setEmail}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={setPassword}
        />
      </FormBody>
    </Card>
  );
}

// Used by both the invitation link and the password-reset link.
function ChoosePasswordScreen({ kind }: { kind: "invitation" | "reset" }) {
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  useEffect(() => {
    if (token) window.history.replaceState({}, "", window.location.pathname);
  }, [token]);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const invitation = kind === "invitation";
  const form = useForm(async () => {
    if (password !== again) {
      throw new Error("The two passwords are not the same.");
    }
    const path = invitation
      ? "/auth/accept-invitation"
      : "/auth/reset-password";
    await postPublic(path, { token, password });
    setDone(true);
  });
  if (done) {
    return (
      <Card
        title="Password saved"
        intro="You can now log in with your new password."
      >
        <a className="button button-primary auth-submit" href="/login">
          Go to log in
        </a>
      </Card>
    );
  }
  return (
    <Card
      title={invitation ? "Welcome to Freight Desk" : "Choose a new password"}
      intro={`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`}
    >
      <FormBody form={form} button="Save password">
        <Field
          label="New password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={setPassword}
        />
        <Field
          label="Repeat the password"
          type="password"
          value={again}
          autoComplete="new-password"
          onChange={setAgain}
        />
      </FormBody>
    </Card>
  );
}

export const AcceptInvitationScreen = () => (
  <ChoosePasswordScreen kind="invitation" />
);
export const ResetPasswordScreen = () => <ChoosePasswordScreen kind="reset" />;
