import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";
const maxImageBytes = 500 * 1024;

async function requireAgent() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (session.role !== "agent") return { response: NextResponse.json({ error: "Agent access required." }, { status: 403 }) } as const;
  return { userId: session.userId } as const;
}

function sniffImage(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function GET() {
  try {
    const auth = await requireAgent();
    if ("response" in auth) return auth.response;
    const rows = await getPool().query(
      "SELECT a.profile_image,a.profile_image_mime FROM agent_account_avatars a INNER JOIN users u ON u.id=a.user_id WHERE u.id=? AND u.role='agent' AND u.active=1 LIMIT 1",
      [auth.userId],
    ) as Array<{ profile_image: Buffer | null; profile_image_mime: string | null }>;
    const image = rows[0]?.profile_image;
    const mime = rows[0]?.profile_image_mime;
    if (!image || !mime || !["image/jpeg", "image/png", "image/webp"].includes(mime)) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const body = new ArrayBuffer(image.byteLength);
    new Uint8Array(body).set(image);
    return new Response(body, { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch {
    return NextResponse.json({ error: "Profile image could not be loaded." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAgent();
    if ("response" in auth) return auth.response;
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "Choose a profile image to upload." }, { status: 400 });
    if (!image.size || image.size > maxImageBytes) return NextResponse.json({ error: "Choose an image no larger than 500 KB." }, { status: 400 });
    const bytes = Buffer.from(await image.arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) return NextResponse.json({ error: "Use a valid JPG, PNG, or WebP image." }, { status: 400 });
    await ensureDatabase();
    await getPool().query(
      `INSERT INTO agent_account_avatars (user_id,profile_image,profile_image_mime) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE profile_image=VALUES(profile_image),profile_image_mime=VALUES(profile_image_mime)`,
      [auth.userId, bytes, mime],
    );
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Profile image could not be uploaded. Please try again." }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const auth = await requireAgent();
    if ("response" in auth) return auth.response;
    await ensureDatabase();
    await getPool().query("DELETE FROM agent_account_avatars WHERE user_id=?", [auth.userId]);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Profile image could not be removed. Please try again." }, { status: 503 });
  }
}
