"use client";
import { useState } from "react";
import { Button, Field, Input, Logo } from "@/components/ui";
import { api } from "@/lib/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", workshop: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: f });
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next?.startsWith("/en/") ? next : "/en/dashboard";
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-lg font-bold">
          <Logo className="size-9" />
          Gori.Lab
        </div>
        <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create your workshop"}</h1>
        {mode === "register" && (
          <>
            <Field label="Your name">
              <Input value={f.name} onChange={set("name")} required autoComplete="name" />
            </Field>
            <Field label="Workshop name">
              <Input value={f.workshop} onChange={set("workshop")} placeholder="Optional" />
            </Field>
          </>
        )}
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set("email")} required autoComplete="email" />
        </Field>
        <Field label="Password" hint={mode === "register" ? "At least 8 characters" : undefined}>
          <Input type="password" value={f.password} onChange={set("password")} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </Field>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <button type="button" className="w-full text-center text-sm text-muted hover:text-fg" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "No account yet? Create a workshop" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
