import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession, refreshAuthSession, revokeAuthSession, SESSION_COOKIE, sessionMaxAge } from "@/lib/auth";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !(await refreshAuthSession(token))) {
    await revokeAuthSession(token);
    return clearSessionCookie(NextResponse.json({ error: "Session expired. Sign in again to continue.", expired: true }, { status: 401 }));
  }

  const session = await getAuthSession();
  if (!session) {
    await revokeAuthSession(token);
    return clearSessionCookie(NextResponse.json({ error: "Session expired. Sign in again to continue.", expired: true }, { status: 401 }));
  }

  const response = NextResponse.json({ ok: true, role: session.role }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
  return response;
}
