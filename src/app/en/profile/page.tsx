"use client";
// Profile, main doc 6.15.
import { useEffect, useState } from "react";
import { Button, Card, Field, Input, ListSkeleton, PageHeader, PhotoInput, Segmented, Switch } from "@/components/ui";
import { api, useMe, useMutate, useQueryState, type Me } from "@/lib/client";

export default function ProfilePage() {
  const { data: me } = useMe();
  const [tab, setTab] = useQueryState("tab", "profile");
  const save = useMutate<Record<string, unknown>>((p) => api("/api/me", { method: "PATCH", json: p }), "Saved");
  const [name, setName] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [del, setDel] = useState("");
  const deleteAll = useMutate<string>((password) => api("/api/me", { method: "DELETE", json: { password } }));

  // eslint-disable-next-line react-hooks/set-state-in-effect -- start editing from the loaded profile
  useEffect(() => { if (me) { setName(me.name); setWorkshop(me.workshop.name); } }, [me]);
  if (!me) return <ListSkeleton />;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" />
      <div className="mb-4 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "profile", label: "Profile" }, { value: "security", label: "Security" },
          { value: "notifications", label: "Notifications" }, { value: "danger", label: "Danger zone" },
        ]} />
      </div>

      {tab === "profile" && (
        <Card>
          <div className="space-y-4">
            <PhotoInput label="Avatar" value={me.avatarUrl} onChange={(u) => save.mutate({ avatarUrl: u })} />
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Email" hint="To change your email, open the Security tab"><Input value={me.email} readOnly disabled /></Field>
            <Field label="Workshop name"><Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} /></Field>
            <div className="flex justify-end">
              <Button variant="primary" disabled={!name.trim() || !workshop.trim()} loading={save.isPending} onClick={() => save.mutate({ name, workshopName: workshop })}>Save</Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "security" && (
        <Card title="Change password">
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }, { onSuccess: () => setPw({ currentPassword: "", newPassword: "", confirm: "" }) });
          }}>
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            {pw.confirm && pw.confirm !== pw.newPassword && <p className="text-sm text-red-500">Passwords do not match</p>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={pw.newPassword.length < 8 || pw.newPassword !== pw.confirm || !pw.currentPassword}>Change password</Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted">Changing the email address is not available in the local version.</p>
        </Card>
      )}

      {tab === "notifications" && <Notifications me={me} onSave={(p) => save.mutate(p)} />}

      {tab === "danger" && (
        <Card title="Delete workshop" className="border-red-500/50">
          <p className="mb-3 text-sm">Deletes your account and every order, client, filament and document in this workshop. This cannot be undone. Download a backup first (Settings → Backups).</p>
          <Field label="Type your password to confirm"><Input type="password" value={del} onChange={(e) => setDel(e.target.value)} /></Field>
          <Button variant="danger" className="mt-3" disabled={!del} loading={deleteAll.isPending} onClick={() => deleteAll.mutate(del, { onSuccess: () => {
            // full reload on purpose: the session is gone
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/login";
          } })}>
            Delete workshop permanently
          </Button>
        </Card>
      )}
    </div>
  );
}

function Notifications({ me, onSave }: { me: Me; onSave: (p: Record<string, unknown>) => void }) {
  return (
    <Card title="Notifications">
      <p className="mb-2 text-sm text-muted">Shown in the bell in the top bar. Email is not sent in the local version.</p>
      <div className="divide-y divide-border">
        <Switch label="Low filament" description="A filament runs out within two weeks or drops below its alert level" checked={me.notifyLowFilament} onChange={(v) => onSave({ notifyLowFilament: v })} />
        <Switch label="Overdue orders" description="An order passes its due date and is not done" checked={me.notifyOverdue} onChange={(v) => onSave({ notifyOverdue: v })} />
      </div>
    </Card>
  );
}
