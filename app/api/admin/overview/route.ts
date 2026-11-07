import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, queryRows } from "@/lib/db";
import { cardTripCode } from "@/lib/card-trips";
import { cardsPerProductionBatch } from "@/lib/card-batches";

type AccountCountRow = { role: "admin" | "agent"; account_status: "active" | "inactive" | "suspended" | "pending"; count: number | string };
type CardCountRow = { allocated: number | string; assigned: number | string };
type TripCountRow = { status: "ready" | "in_transit" | "on_hold" | "completed"; count: number | string };
type VerificationCountRow = { total: number | string; verified: number | string; flagged: number | string };
type AgentAccessCountRow = { total: number | string; awaiting_signup: number | string; active: number | string; pending_verification: number | string };
type BatchCountRow = { total: number | string };
type RecentBatchRow = { id: number | string; batch_date: string | Date; allocated_quantity: number | string; assigned_quantity: number | string };
type RecentCheckRow = { id: number | string; step: number | string; outcome: "verified" | "flagged"; checked_at: string | Date; agent_name: string; origin: string; destination: string; vehicle_class: string; batch_id: number | string; public_token: string };

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  try {
    await ensureDatabase();
    const [accountRows, cardRows, tripRows, verificationRows, agentAccessRows, batchRows, recentBatchRows, recentCheckRows] = await Promise.all([
      queryRows<AccountCountRow>(
        `SELECT u.role,
          CASE WHEN u.role = 'agent' AND ag.email_verified_at IS NULL THEN 'pending'
            WHEN u.role = 'admin' THEN COALESCE(aas.status, IF(u.active = 1, 'active', 'inactive'))
            ELSE COALESCE(ags.status, IF(u.active = 1, 'active', 'inactive')) END AS account_status,
          COUNT(*) AS count
         FROM users u
         LEFT JOIN admin_account_status aas ON aas.user_id = u.id
         LEFT JOIN agent_account_status ags ON ags.user_id = u.id
         LEFT JOIN agent_profiles ag ON ag.user_id = u.id
         WHERE u.role IN ('admin', 'agent')
         GROUP BY u.role, account_status`,
      ),
      queryRows<CardCountRow>(
        `SELECT COALESCE(SUM(c.allocated_quantity), 0) AS allocated,
          COALESCE(SUM(COALESCE(p.assigned, 0) + COALESCE(old.assigned, 0)), 0) AS assigned
         FROM transport_production_categories c
         LEFT JOIN (SELECT category_id, COUNT(*) AS assigned FROM transport_production_trip_assignments GROUP BY category_id) p ON p.category_id = c.id
         LEFT JOIN (
           SELECT c2.id AS category_id, COUNT(legacy.batch_id) AS assigned FROM transport_production_categories c2
           LEFT JOIN (
             SELECT batch_id FROM transport_card_trips UNION ALL SELECT batch_id FROM transport_card_trip_assignments
           ) legacy ON legacy.batch_id = c2.legacy_batch_id GROUP BY c2.id
         ) old ON old.category_id = c.id`,
      ),
      queryRows<TripCountRow>(
        `SELECT status, COUNT(*) AS count FROM (
          SELECT status FROM transport_card_trips UNION ALL SELECT status FROM transport_card_trip_assignments
          UNION ALL SELECT status FROM transport_production_trip_assignments
        ) all_trips GROUP BY status`,
      ),
      queryRows<VerificationCountRow>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(outcome = 'verified'), 0) AS verified, COALESCE(SUM(outcome = 'flagged'), 0) AS flagged
         FROM (SELECT outcome FROM transport_card_verification_events UNION ALL SELECT outcome FROM transport_card_assignment_events
          UNION ALL SELECT outcome FROM transport_production_trip_events) all_events`,
      ),
      queryRows<AgentAccessCountRow>(
        `SELECT COUNT(*) AS total,
          COALESCE(SUM(ap.user_id IS NULL), 0) AS awaiting_signup,
          COALESCE(SUM(ap.user_id IS NOT NULL AND ag.email_verified_at IS NOT NULL AND u.active = 1 AND COALESCE(ags.status, 'active') = 'active'), 0) AS active,
          COALESCE(SUM(ap.user_id IS NOT NULL AND ag.email_verified_at IS NULL), 0) AS pending_verification
         FROM agent_preregistrations p
         LEFT JOIN agent_profiles ap ON ap.preregistration_id = p.id
         LEFT JOIN users u ON u.id = ap.user_id
         LEFT JOIN agent_profiles ag ON ag.user_id = u.id
         LEFT JOIN agent_account_status ags ON ags.user_id = u.id`,
      ),
      queryRows<BatchCountRow>("SELECT COUNT(*) AS total FROM transport_production_batches"),
      queryRows<RecentBatchRow>(
        `SELECT b.id, b.batch_date,
          COALESCE(SUM(c.allocated_quantity), 0) AS allocated_quantity,
          COALESCE(SUM(c.assigned_quantity), 0) AS assigned_quantity
         FROM transport_production_batches b
         LEFT JOIN (
           SELECT c.id, c.production_batch_id, c.allocated_quantity,
             COALESCE((SELECT COUNT(*) FROM transport_production_trip_assignments n WHERE n.category_id = c.id), 0) +
             COALESCE((SELECT COUNT(*) FROM transport_card_trips old WHERE old.batch_id = c.legacy_batch_id), 0) +
             COALESCE((SELECT COUNT(*) FROM transport_card_trip_assignments old WHERE old.batch_id = c.legacy_batch_id), 0) AS assigned_quantity
           FROM transport_production_categories c
         ) c ON c.production_batch_id = b.id
         GROUP BY b.id ORDER BY b.id DESC LIMIT 4`,
      ),
      queryRows<RecentCheckRow>(
        `SELECT activity.* FROM (
          SELECT -e.id AS id, e.step, e.outcome, e.checked_at, u.display_name AS agent_name,
            t.origin, t.destination, b.vehicle_class, t.batch_id, tt.public_token
          FROM transport_card_assignment_events e JOIN users u ON u.id = e.user_id
          JOIN transport_card_trip_assignments t ON t.id = e.trip_id
          JOIN transport_card_batches b ON b.id = t.batch_id
          JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
          UNION ALL
          SELECT e.id, e.step, e.outcome, e.checked_at, u.display_name AS agent_name,
            t.origin, t.destination, b.vehicle_class, t.batch_id, tt.public_token
          FROM transport_card_verification_events e JOIN users u ON u.id = e.user_id
          JOIN transport_card_trips t ON t.id = e.trip_id
          JOIN transport_card_batches b ON b.id = t.batch_id
          JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
          UNION ALL
          SELECT -e.id AS id, e.step, e.outcome, e.checked_at, u.display_name AS agent_name,
            t.origin, t.destination, c.vehicle_class, ${cardsPerProductionBatch} * (t.production_batch_id - 1) + 1 AS batch_id, t.public_token
          FROM transport_production_trip_events e JOIN users u ON u.id = e.user_id
          JOIN transport_production_trip_assignments t ON t.id = e.trip_id
          JOIN transport_production_categories c ON c.id = t.category_id
        ) activity ORDER BY checked_at DESC, id DESC LIMIT 5`,
      ),
    ]);

    const accounts = {
      admins: { total: 0, active: 0, inactive: 0, suspended: 0 },
      agents: { total: 0, active: 0, inactive: 0, suspended: 0, pending: 0 },
    };
    for (const row of accountRows) {
      const count = Number(row.count);
      const target = row.role === "admin" ? accounts.admins : accounts.agents;
      target.total += count;
      if (row.account_status === "pending" && row.role === "agent") accounts.agents.pending += count;
      else if (row.account_status === "active" || row.account_status === "inactive" || row.account_status === "suspended") target[row.account_status] += count;
    }

    return NextResponse.json({
      accounts,
      cards: {
        allocated: Number(cardRows[0]?.allocated ?? 0),
        assigned: Number(cardRows[0]?.assigned ?? 0),
      },
      batches: Number(batchRows[0]?.total ?? 0),
      trips: Object.fromEntries(tripRows.map(({ status, count }) => [status, Number(count)])),
      verification: {
        total: Number(verificationRows[0]?.total ?? 0),
        verified: Number(verificationRows[0]?.verified ?? 0),
        flagged: Number(verificationRows[0]?.flagged ?? 0),
      },
      agentAccess: {
        total: Number(agentAccessRows[0]?.total ?? 0),
        awaitingSignup: Number(agentAccessRows[0]?.awaiting_signup ?? 0),
        active: Number(agentAccessRows[0]?.active ?? 0),
        pendingVerification: Number(agentAccessRows[0]?.pending_verification ?? 0),
      },
      recentBatches: recentBatchRows.map((batch) => ({
        id: Number(batch.id),
        batch_date: String(batch.batch_date).slice(0, 10),
        allocated_quantity: Number(batch.allocated_quantity ?? 0),
        assigned_quantity: Number(batch.assigned_quantity ?? 0),
      })),
      recentChecks: recentCheckRows.map((check) => ({
        id: Number(check.id),
        code: cardTripCode(Number(check.batch_id), check.public_token),
        step: Number(check.step),
        outcome: check.outcome,
        checked_at: check.checked_at,
        agent_name: check.agent_name,
        origin: check.origin,
        destination: check.destination,
        vehicle_class: check.vehicle_class,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load operations overview:", error);
    return NextResponse.json({ error: "Overview data could not be loaded. Check the database connection and schema." }, { status: 503 });
  }
}
