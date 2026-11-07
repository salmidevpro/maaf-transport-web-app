"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, Eye, ShieldAlert, ShieldCheck, Trash2, UserPlus, Users, UserRound, RefreshCw } from "lucide-react";

type UserRecord = {
  id: number;
  email: string;
  display_name: string;
  name: string;
  role: "admin" | "agent";
  active: number;
  accountStatus: "active" | "inactive" | "suspended";
  created_at: string | Date;
  username: string | null;
  phone: string | null;
  location: string | null;
  origin_state: string | null;
  origin_lga: string | null;
  email_verified_at: string | Date | null;
};
type RoleFilter = "All users" | "Admins" | "Agents";
const emptyForm = { firstName: "", lastName: "", surname: "", email: "" };

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(date);
}

export function AdminUsersRoles() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filter, setFilter] = useState<RoleFilter>("All users");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [viewUser, setViewUser] = useState<UserRecord | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/admin/users", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { users?: UserRecord[]; currentUserId?: number; error?: string };
        if (!response.ok || !payload.users) throw new Error(payload.error || "Users could not be loaded.");
        setCurrentUserId(payload.currentUserId ?? null);
        return payload.users;
      })
      .then((records) => { setUsers(records); setLoadError(""); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setLoadError(error instanceof Error ? error.message : "Users could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  const adminCount = useMemo(() => users.filter((user) => user.role === "admin").length, [users]);
  const agentCount = useMemo(() => users.filter((user) => user.role === "agent").length, [users]);
  const visibleUsers = users.filter((user) => filter === "All users" || user.role === (filter === "Admins" ? "admin" : "agent"));

  async function changeAdminStatus(user: UserRecord, status: UserRecord["accountStatus"]) {
    if (actionBusyId !== null || (user.role === "admin" && user.id === currentUserId)) return;
    setActionBusyId(user.id); setActionError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Account status could not be updated.");
      setActionMessage(`${user.name}'s account is now ${status}.`);
      setRetry((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Account status could not be updated.");
    } finally { setActionBusyId(null); }
  }

  async function confirmDeleteAdmin() {
    if (!deleteUser || actionBusyId !== null) return;
    const target = deleteUser;
    setActionBusyId(target.id); setActionError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/admin/users/${target.id}`, { method: "DELETE" });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "User account could not be deleted.");
      setDeleteUser(null);
      setActionMessage(`${target.name}'s ${target.role} account was deleted.`);
      setRetry((value) => value + 1);
    } catch (error) {
      setDeleteUser(null);
      setActionError(error instanceof Error ? error.message : "User account could not be deleted.");
    } finally { setActionBusyId(null); }
  }
  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage(""); setFormError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, surname: form.surname, email: form.email }),
      });
      const payload = await response.json() as { success?: boolean; alreadyExists?: boolean; emailSent?: boolean; user?: UserRecord; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Administrator could not be created.");
      setForm(emptyForm);
      setMessage(payload.alreadyExists
        ? "This administrator account already exists. It is listed below."
        : payload.emailSent
          ? "Administrator created. A temporary password and sign-in instructions were emailed to them."
          : "Administrator created, but the email could not be sent. Check the email service configuration and contact the new admin securely.");
      setRetry((value) => value + 1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Administrator could not be created.");
    } finally { setSaving(false); }
  }

  return <div className="users-roles-page">
    <div className="users-roles-summary">
      <article className="users-roles-stat panel"><div className="users-roles-stat-icon users-roles-admin-icon"><ShieldCheck size={19}/></div><div><span>Administrators</span><b>{adminCount}</b></div></article>
      <article className="users-roles-stat panel"><div className="users-roles-stat-icon"><Users size={19}/></div><div><span>Agent accounts</span><b>{agentCount}</b></div></article>
      <article className="users-roles-stat panel"><div className="users-roles-stat-icon users-roles-active-icon"><UserRound size={19}/></div><div><span>Active accounts</span><b>{users.filter((user) => Boolean(user.active)).length}</b></div></article>
    </div>

    <section className="panel users-roles-create">
      <div className="panel-heading"><div><h2>Create administrator</h2><p>Add another trusted administrator to this workspace.</p></div><span className="users-roles-create-badge"><UserPlus size={16}/> Admin role</span></div>
      <form onSubmit={createAdmin}>
        <div className="users-roles-form-grid">
          <label><span>First name</span><input autoComplete="given-name" maxLength={60} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required/></label>
          <label><span>Last name</span><input autoComplete="family-name" maxLength={60} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required/></label>
          <label><span>Third name <i>optional</i></span><input autoComplete="additional-name" maxLength={60} value={form.surname} onChange={(event) => setForm({ ...form, surname: event.target.value })}/></label>
          <label><span>Email address</span><input type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required/></label>
        </div>
        <div className="users-roles-notice is-success" role="note"><ShieldCheck size={17}/>The first name will be the temporary password and will be sent to this email address. The admin must choose a new password at first sign-in.</div>
        {message && <div className="users-roles-notice is-success" role="status"><CheckCircle2 size={17}/>{message}</div>}
        {formError && <div className="users-roles-notice is-error" role="alert"><ShieldAlert size={17}/>{formError}</div>}
        <div className="users-roles-form-actions"><span><ShieldCheck size={15}/> New account receives full administrator access.</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? <><Clock3 className="spin" size={16}/> Creating…</> : <><UserPlus size={16}/> Create admin</>}</button></div>
      </form>
    </section>

    <section className="panel users-roles-list">
      <div className="panel-heading"><div><h2>Workspace users</h2><p>Administrator accounts and registered agents.</p></div><button className="button button-secondary button-small" onClick={() => setRetry((value) => value + 1)} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""}/> Refresh</button></div>
      <div className="users-roles-tabs" role="tablist" aria-label="Filter workspace users">{(["All users", "Admins", "Agents"] as RoleFilter[]).map((option) => <button key={option} role="tab" aria-selected={filter === option} className={filter === option ? "is-selected" : ""} onClick={() => setFilter(option)}>{option}<span>{option === "All users" ? users.length : option === "Admins" ? adminCount : agentCount}</span></button>)}</div>
      {actionMessage && <div className="users-roles-notice is-success" role="status"><CheckCircle2 size={17}/>{actionMessage}</div>}
      {actionError && <div className="users-roles-notice is-error" role="alert"><ShieldAlert size={17}/>{actionError}</div>}
      {loadError && <div className="users-roles-notice is-error" role="alert"><ShieldAlert size={17}/>{loadError}<button className="button button-secondary button-small" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {loading ? <div className="users-roles-empty"><Clock3 className="spin" size={20}/> Loading workspace users…</div> : !loadError && visibleUsers.length === 0 ? <div className="users-roles-empty"><Users size={22}/><b>No {filter === "All users" ? "users" : filter.toLowerCase()} found</b><span>Accounts will appear here when they are created.</span></div> : !loadError && <div className="users-roles-table-wrap"><table className="users-roles-table"><thead><tr><th>USER</th><th>ROLE</th><th>CONTACT</th><th>ADDRESS / ORIGIN</th><th>STATUS</th><th>JOINED</th><th>ACTIONS</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}>
        <td><div className="users-roles-user"><span>{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><b>{user.name}</b><small>{user.username ? `@${user.username}` : `User #${user.id}`}</small></div></div></td>
        <td><span className={`users-roles-role role-${user.role}`}>{user.role === "admin" ? <ShieldCheck size={13}/> : <Users size={13}/>} {user.role === "admin" ? "Administrator" : "Agent"}</span></td>
        <td><b>{user.email}</b>{user.phone && <small>{user.phone}</small>}</td>
        <td>{[user.location, user.role === "agent" && user.origin_state ? `Origin: ${user.origin_state}` : null, user.role === "agent" && user.origin_lga ? `LGA: ${user.origin_lga}` : null].filter(Boolean).join(" · ") || "Not provided"}</td>
        <td><span className={`users-roles-status ${user.accountStatus === "active" ? "status-on" : user.accountStatus === "suspended" ? "status-suspended" : "status-off"}`}><i/>{user.role === "agent" && !user.email_verified_at && user.active ? "Verify email" : user.accountStatus === "suspended" ? "Suspended" : user.accountStatus === "inactive" ? "Inactive" : "Active"}</span></td>
        <td>{formatDate(user.created_at)}</td>
        <td><div className="users-roles-actions"><button type="button" className="users-roles-icon-action" aria-label={`View ${user.role} ${user.name}`} title={`View ${user.role}`} onClick={() => setViewUser(user)}><Eye size={16}/></button><select aria-label={`Set ${user.name} account status`} title={user.role === "admin" && user.id === currentUserId ? "You cannot disable or suspend your own account" : "Change account status"} value={user.accountStatus} disabled={actionBusyId === user.id || (user.role === "admin" && user.id === currentUserId)} onChange={(event) => void changeAdminStatus(user, event.target.value as UserRecord["accountStatus"])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select><button type="button" className="users-roles-icon-action is-danger" aria-label={`Delete ${user.role} ${user.name}`} title={user.role === "admin" && user.id === currentUserId ? "You cannot delete your own account" : `Delete ${user.role}`} disabled={(user.role === "admin" && user.id === currentUserId) || actionBusyId === user.id} onClick={() => setDeleteUser(user)}><Trash2 size={16}/></button></div></td>
      </tr>)}</tbody></table></div>}
      <div className="users-roles-list-foot"><span>Roles are managed by the MAAF workspace administrator.</span><span><i/> Account information is private</span></div>
    </section>
    {viewUser && <div className="users-roles-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewUser(null); }}><section className="users-roles-modal" role="dialog" aria-modal="true" aria-labelledby="users-roles-view-title"><div className="users-roles-modal-heading"><div><span>{viewUser.role.toUpperCase()} ACCOUNT</span><h2 id="users-roles-view-title">{viewUser.name}</h2></div><button type="button" className="users-roles-icon-action" aria-label="Close account details" onClick={() => setViewUser(null)}>×</button></div><dl><div><dt>Status</dt><dd>{viewUser.accountStatus === "suspended" ? "Suspended" : viewUser.accountStatus === "inactive" ? "Inactive" : "Active"}</dd></div><div><dt>Email</dt><dd>{viewUser.email}</dd></div><div><dt>Username</dt><dd>{viewUser.username || "Not set"}</dd></div><div><dt>Address</dt><dd>{viewUser.location || "Not provided"}</dd></div>{viewUser.role === "agent" && <><div><dt>State of origin</dt><dd>{viewUser.origin_state || "Not provided"}</dd></div><div><dt>Local government of origin</dt><dd>{viewUser.origin_lga || "Not provided"}</dd></div><div><dt>Email verification</dt><dd>{viewUser.email_verified_at ? "Verified" : "Not verified"}</dd></div></> }<div><dt>Joined</dt><dd>{formatDate(viewUser.created_at)}</dd></div></dl><div className="users-roles-modal-actions"><button type="button" className="button button-secondary" onClick={() => setViewUser(null)}>Close</button></div></section></div>}
    {deleteUser && <div className="users-roles-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && actionBusyId === null) setDeleteUser(null); }}><section className="users-roles-modal" role="alertdialog" aria-modal="true" aria-labelledby="users-roles-delete-title"><div className="users-roles-modal-heading"><div><span>DELETE {deleteUser.role.toUpperCase()}</span><h2 id="users-roles-delete-title">Delete {deleteUser.name}?</h2></div><button type="button" className="users-roles-icon-action" aria-label="Close delete confirmation" disabled={actionBusyId !== null} onClick={() => setDeleteUser(null)}>×</button></div><p>This removes the {deleteUser.role} account and signs out its sessions. Accounts with recorded activity cannot be deleted to preserve audit history.</p><div className="users-roles-modal-actions"><button type="button" className="button button-secondary" disabled={actionBusyId !== null} onClick={() => setDeleteUser(null)}>Cancel</button><button type="button" className="button button-danger" disabled={actionBusyId !== null} onClick={() => void confirmDeleteAdmin()}>{actionBusyId === deleteUser.id ? <><Clock3 className="spin" size={15}/> Deleting…</> : <><Trash2 size={15}/> Delete {deleteUser.role}</>}</button></div></section></div>}
  </div>;
}
