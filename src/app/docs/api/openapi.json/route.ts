import { KODE_GALAT } from "@/lib/api-def";
import { ENDPOINT_DOK } from "@/lib/api-dok";

/** Spesifikasi OpenAPI 3.1 API v1 mesin, dibangun dari sumber yang sama dengan halaman /docs/api (statis). */

function skema(v: unknown): Record<string, unknown> {
  if (v === null) return { type: "null" };
  if (Array.isArray(v)) return { type: "array", items: v.length ? skema(v[0]) : {} };
  if (typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, skema(x)])) };
  return { type: typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v };
}

export function GET() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINT_DOK) {
    const params = [...e.jalur.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    (paths[e.jalur] ??= {})[e.metode.toLowerCase()] = {
      summary: e.ringkas.en,
      description: e.ringkas.id,
      tags: [e.fitur ?? "status"],
      ...(params.length ? { parameters: params } : {}),
      ...(e.minta !== undefined ? { requestBody: { required: true, content: { "application/json": { schema: skema(e.minta), example: e.minta } } } } : {}),
      responses: {
        [String(e.status ?? 200)]: { description: "OK", content: { "application/json": { schema: skema(e.jawab), example: e.jawab } } },
        default: { description: "Galat", content: { "application/json": { schema: { $ref: "#/components/schemas/Galat" } } } },
      },
    };
  }
  return Response.json({
    openapi: "3.1.0",
    info: { title: "ChatGerCep Mesin API", version: "1.0.0", description: "API v1 mesin ChatGerCep self-host. Dokumentasi: https://chatgercep.com/docs/api" },
    servers: [{ url: "https://{alamat}/api/v1", variables: { alamat: { default: "wa.domain-anda.com" } } }],
    security: [{ bearer: [] }],
    paths,
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "cg_live_… (production) atau cg_test_… (sandbox: 1 nomor penguji) dari portal Developer" } },
      schemas: {
        Galat: {
          type: "object",
          properties: { galat: { type: "object", properties: { kode: { type: "string", enum: Object.keys(KODE_GALAT) }, pesan: { type: "string" }, id_permintaan: { type: "string" } } } },
        },
      },
    },
  });
}
