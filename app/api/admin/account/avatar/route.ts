import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";

const maxImageBytes = 500 * 1024;

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
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
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    await ensureDatabase();
    const rows = await getPool().query(
      "SELECT p.profile_image, p.profile_image_mime FROM admin_profiles p INNER JOIN users u ON u.id = p.user_id WHERE u.id = ? AND u.role = 'admin' AND u.active = 1 LIMIT 1",
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
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "Choose a profile image to upload." }, { status: 400 });
    if (image.size === 0 || image.size > maxImageBytes) return NextResponse.json({ error: "Choose an image no larger than 500 KB." }, { status: 400 });
    const bytes = Buffer.from(await image.arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) return NextResponse.json({ error: "Use a valid JPG, PNG, or WebP image." }, { status: 400 });
    await ensureDatabase();
    await getPool().query(
      "UPDATE admin_profiles p INNER JOIN users u ON u.id = p.user_id SET p.profile_image = ?, p.profile_image_mime = ? WHERE u.id = ? AND u.role = 'admin' AND u.active = 1",
      [bytes, mime, auth.userId],
    );
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Profile image could not be uploaded. Please try again." }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    await ensureDatabase();
    await getPool().query(
      "UPDATE admin_profiles p INNER JOIN users u ON u.id = p.user_id SET p.profile_image = NULL, p.profile_image_mime = NULL WHERE u.id = ? AND u.role = 'admin' AND u.active = 1",
      [auth.userId],
    );
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Profile image could not be removed. Please try again." }, { status: 503 });
  }
}
