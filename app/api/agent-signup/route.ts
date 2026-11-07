import { NextResponse } from "next/server";
import { registerAgent } from "@/lib/agent-onboarding";
import nigeriaLgas from "@/data/nigeria-lga.json";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Complete the signup form." }, { status: 400 }); }
  const fields = ["nin", "username", "email", "password", "confirmPassword", "firstName", "lastName", "otherNames", "phoneCountryCode", "phone", "location", "originState", "originLga", "country"];
  const values = Object.fromEntries(fields.map((field) => [field, typeof body[field] === "string" ? (body[field] as string).trim() : ""])) as Record<string, string>;
  values.nin = values.nin.replace(/\D/g, "");
  values.email = values.email.toLowerCase();
  values.username = values.username.toLowerCase();
  if (!/^\d{11}$/.test(values.nin)) return NextResponse.json({ error: "Enter the 11-digit NIN that MAAF pre-registered for you." }, { status: 400 });
  if (!/^[a-z0-9._-]{3,40}$/.test(values.username)) return NextResponse.json({ error: "Choose a username with 3–40 letters, numbers, dots, underscores, or hyphens." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (values.password.length < 8 || values.password.length > 200) return NextResponse.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  if (!/[A-Z]/.test(values.password)) return NextResponse.json({ error: "Add at least one uppercase letter to your password." }, { status: 400 });
  if (!/[0-9]/.test(values.password)) return NextResponse.json({ error: "Add at least one number to your password." }, { status: 400 });
  if (!/[^A-Za-z0-9]/.test(values.password)) return NextResponse.json({ error: "Add at least one special character to your password." }, { status: 400 });
  if (values.password !== values.confirmPassword) return NextResponse.json({ error: "The passwords do not match." }, { status: 400 });
  const phoneDigits = values.phone.replace(/\D/g, "");
  if (values.phoneCountryCode !== "+234" || !/^0\d{10}$/.test(phoneDigits)) {
    return NextResponse.json({ error: "Enter an 11-digit Nigerian phone number starting with 0." }, { status: 400 });
  }
  const internationalPhoneDigits = phoneDigits.startsWith("0") ? phoneDigits.slice(1) : phoneDigits;
  values.phone = `${values.phoneCountryCode}${internationalPhoneDigits}`;
  const locations = nigeriaLgas as Record<string, string[]>;
  const requiredDetails = ["phone", "location", "originState", "originLga"];
  if (requiredDetails.some((field) => !values[field] || values[field].length > 120)) return NextResponse.json({ error: "Complete your contact and location details." }, { status: 400 });
  if (!locations[values.originState]) return NextResponse.json({ error: "Choose a valid Nigerian state of origin." }, { status: 400 });
  if (!locations[values.originState]?.includes(values.originLga)) return NextResponse.json({ error: "Choose a local government area belonging to your state of origin." }, { status: 400 });
  values.country = "Nigeria";
  try {
    const result = await registerAgent({
      nin: values.nin, username: values.username, email: values.email, password: values.password,
      firstName: values.firstName, lastName: values.lastName, otherNames: values.otherNames,
      phone: values.phone, location: values.location, originState: values.originState,
      originLga: values.originLga, country: values.country,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Agent signup failed:", error);
    const detail = error instanceof Error ? error.message : "Could not complete signup.";
    return NextResponse.json({ error: detail }, { status: 503 });
  }
}
