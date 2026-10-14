import { connection } from "next/server";
import { db } from "@/lib/db";

/** Dipakai healthcheck container: proses hidup dan database bisa dibaca. */
export async function GET() {
  await connection();
  // Sengaja lewat variabel: bentuk (await db())`...` dirusak minifier build (tanda kurungnya hilang).
  const sql = await db();
  await sql`SELECT 1`;
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
