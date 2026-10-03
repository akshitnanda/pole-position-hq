export type TextExportDocument = { title: string; filename: string; text: string };

// The caller owns the lifetime. Keep the URL valid while the export preview is open.
export function createTextDownload(text: string, urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL) {
  const href = urlApi.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  let released = false;
  return { href, release() {
    if (released) return;
    released = true;
    urlApi.revokeObjectURL(href);
  } };
}
