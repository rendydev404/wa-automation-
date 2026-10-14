import "server-only";

/** Ambil teks dari PDF. PDF hasil pindai (gambar saja) menghasilkan teks kosong. */
export async function teksDariPdf(data: Uint8Array): Promise<{ teks: string; halaman: number }> {
  // Dimuat hanya saat ada unggahan PDF (pdf.js cukup besar).
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { teks: (text as string[]).join("\n\n"), halaman: totalPages };
}
