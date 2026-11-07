import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { hasAgentOriginLgaColumn, queryRows } from "@/lib/db";
import { notifyAdminsOfAgentActivity } from "@/lib/portal-notifications";

export const dynamic = "force-dynamic";

async function requireAgent() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in to open your profile." }, { status: 401 }) } as const;
  if (session.role !== "agent") return { response: NextResponse.json({ error: "Agent access required." }, { status: 403 }) } as const;
  return { session } as const;
}

export async function GET() {
  const auth = await requireAgent();
  if ("response" in auth) return auth.response;
  try {
    const originLgaExpression = await hasAgentOriginLgaColumn()
      ? "COALESCE(NULLIF(p.origin_lga,''),p.residence_state,'')"
      : "COALESCE(p.residence_state,'')";
    const rows = await queryRows<{
      username: string; first_name: string; last_name: string; other_names: string; phone: string;
      location: string; origin_state: string; origin_lga: string; country: string; email_verified_at: string | Date | null; is_registered: number;
    }>(
      `SELECT COALESCE(p.username,NULLIF(SUBSTRING_INDEX(u.email,'@',1),'')) AS username,
         COALESCE(p.first_name,SUBSTRING_INDEX(TRIM(u.display_name),' ',1),'') AS first_name,
         COALESCE(p.last_name,'') AS last_name,COALESCE(p.other_names,'') AS other_names,
         COALESCE(p.phone,pref.phone,'') AS phone,COALESCE(p.location,pref.location,'') AS location,
         COALESCE(p.origin_state,'') AS origin_state,${originLgaExpression} AS origin_lga,
         COALESCE(p.country,'') AS country,p.email_verified_at,(p.user_id IS NOT NULL) AS is_registered
       FROM users u LEFT JOIN agent_profiles p ON p.user_id=u.id
       LEFT JOIN agent_account_preferences pref ON pref.user_id=u.id
       WHERE u.id=? AND u.role='agent' AND u.active=1 LIMIT 1`,
      [auth.session.userId],
    );
    if (!rows[0]) return NextResponse.json({ error: "Your agent account could not be found." }, { status: 404 });
    return NextResponse.json({ profile: { ...rows[0], isRegistered: Boolean(rows[0].is_registered), email: auth.session.email, displayName: auth.session.name } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load agent profile:", error);
    return NextResponse.json({ error: "Your profile could not be loaded." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAgent();
  if ("response" in auth) return auth.response;
  let body: { phone?: unknown; location?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter valid profile details." }, { status: 400 }); }
  const phone = typeof body.phone === "string" ? body.phone.trim().replace(/\s+/g, " ") : "";
  const location = typeof body.location === "string" ? body.location.trim().replace(/\s+/g, " ") : "";
  if (phone.length < 7 || phone.length > 40 || !/^[+()\d .-]+$/.test(phone)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  if (location.length < 2 || location.length > 120) return NextResponse.json({ error: "Enter your address (2–120 characters)." }, { status: 400 });
  try {
    const registeredProfile = await queryRows<{ user_id: number }>("SELECT p.user_id FROM agent_profiles p INNER JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND u.role='agent' AND u.active=1 LIMIT 1", [auth.session.userId]);
    if (registeredProfile.length) {
      await queryRows(
        "UPDATE agent_profiles p INNER JOIN users u ON u.id=p.user_id SET p.phone=?,p.location=? WHERE p.user_id=? AND u.role='agent' AND u.active=1",
        [phone, location, auth.session.userId],
      );
    } else {
      await queryRows(
        `INSERT INTO agent_account_preferences (user_id,phone,location) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE phone=VALUES(phone),location=VALUES(location)`,
        [auth.session.userId, phone, location],
      );
    }
    try { await notifyAdminsOfAgentActivity(auth.session.userId, "Agent profile updated", `${auth.session.name} updated their phone number or address.`); }
    catch (error) { console.error("Could not notify admins about an agent profile update:", error); }
    return NextResponse.json({ success: true, message: "Your contact details were saved." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not save agent profile:", error);
    return NextResponse.json({ error: "Your profile could not be saved." }, { status: 503 });
  }
}
