import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { encryptNin, hashNin } from "@/lib/agent-onboarding";
import { ensureDatabase, getPool, hasAgentOriginLgaColumn, queryRows } from "@/lib/db";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const originLgaExpression = await hasAgentOriginLgaColumn()
      ? "COALESCE(NULLIF(ap.origin_lga,''),ap.residence_state,'')"
      : "COALESCE(ap.residence_state,'')";
    const records = await queryRows<{ id: number; first_name: string; last_name: string; other_names: string; created_at: string; username: string | null; email: string | null; active: number | null; phone: string | null; location: string | null; origin_state: string | null; origin_lga: string | null; country: string | null }>(
      `SELECT p.id,p.first_name,p.last_name,p.other_names,p.created_at,ap.username,u.email,u.active,
         ap.phone,ap.location,ap.origin_state,${originLgaExpression} AS origin_lga,ap.country
       FROM agent_preregistrations p LEFT JOIN agent_profiles ap ON ap.preregistration_id=p.id
       LEFT JOIN users u ON u.id=ap.user_id ORDER BY p.created_at DESC`,
    );
    return NextResponse.json(records.map((record) => ({ ...record, nin: null, status: !record.username ? "Awaiting signup" : record.active ? "Active" : "Verify email" })));
  } catch (error) {
    console.error("Could not load agent pre-registrations:", error);
    return NextResponse.json({ error: "Could not load records. Check the database connection and schema." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the agent details." }, { status: 400 }); }
  const nin = typeof body.nin === "string" ? body.nin.replace(/\D/g, "") : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const otherNames = typeof body.otherNames === "string" ? body.otherNames.trim() : "";
  if (!/^\d{11}$/.test(nin) || !firstName || !lastName || firstName.length > 80 || lastName.length > 80 || otherNames.length > 120) {
    return NextResponse.json({ error: "Enter a valid 11-digit NIN, first name, last name, and optional other names." }, { status: 400 });
  }
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const inserted = await connection.query(
        "INSERT INTO agent_preregistrations (nin_hash, first_name, last_name, other_names, created_by) VALUES (?, ?, ?, ?, (SELECT id FROM users WHERE email=? AND role='admin' LIMIT 1))",
        [hashNin(nin), firstName, lastName, otherNames, session.email],
      ) as { insertId: number };
      await connection.query("INSERT INTO agent_preregistration_nins (preregistration_id,nin_encrypted) VALUES (?,?)", [inserted.insertId, encryptNin(nin)]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return NextResponse.json({ error: "This NIN is already pre-registered." }, { status: 409 });
    console.error("Could not create agent pre-registration:", error);
    return NextResponse.json({ error: "Could not save this agent. Check the database connection and NIN encryption key." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let body: { nin?: unknown; id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the agent’s NIN." }, { status: 400 }); }
  const nin = typeof body.nin === "string" ? body.nin.replace(/\D/g, "") : "";
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1 || !/^\d{11}$/.test(nin)) return NextResponse.json({ error: "Enter a valid record and 11-digit NIN." }, { status: 400 });
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [record] = await connection.query("SELECT id FROM agent_preregistrations WHERE id=? FOR UPDATE", [id]) as Array<{ id: number }>;
      if (!record) { await connection.rollback(); return NextResponse.json({ error: "Agent record not found." }, { status: 404 }); }
      await connection.query("UPDATE agent_preregistrations SET nin_hash=? WHERE id=?", [hashNin(nin), id]);
      await connection.query("INSERT INTO agent_preregistration_nins (preregistration_id,nin_encrypted) VALUES (?,?) ON DUPLICATE KEY UPDATE nin_encrypted=VALUES(nin_encrypted)", [id, encryptNin(nin)]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    return NextResponse.json({ ok: true, nin });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return NextResponse.json({ error: "That NIN is already assigned to another pre-registration." }, { status: 409 });
    console.error("Could not update the pre-registered NIN:", error);
    return NextResponse.json({ error: "Could not save this NIN. Check the database connection and NIN encryption key." }, { status: 503 });
  }
}
