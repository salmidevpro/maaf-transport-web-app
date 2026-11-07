import { NextResponse } from "next/server";
import { authenticatePortalAccount, createAuthSession, sessionMaxAge, SESSION_COOKIE, type PortalRole } from "@/lib/auth";

export async function POST(request: Request) {
  let body: { email?: string; password?: string; role?: PortalRole };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your email and password." }, { status: 400 }); }
  if ((body.role !== "admin" && body.role !== "agent") || typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }
  try {
    const account = await authenticatePortalAccount(body.email, body.password, body.role);
    if (!account) {
      return NextResponse.json({ error: "That email or password is incorrect." }, { status: 401 });
    }
    const { token } = await createAuthSession(account.id);
    const response = NextResponse.json({ role: account.role, mustChangePassword: account.mustChangePassword });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionMaxAge,
    });
    return response;
  } catch (error) {
    console.error("Could not complete portal sign-in:", error);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Try again in a moment." }, { status: 503 });
  }
}
