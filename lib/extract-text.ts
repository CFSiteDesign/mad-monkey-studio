// Client-side text extraction for the presentation "add a document" flow.
// Heavy parsers (pdf.js, mammoth) are dynamically imported so they only load
// when a user actually attaches a file — they never touch the initial bundle.

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".rtf") ||
    file.type.startsWith("text/")
  ) {
    return (await file.text()).trim();
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value.trim();
  }

  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    // Worker fetched from a CDN at the exact installed version (no Turbopack
    // worker-bundling headaches).
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((it) => ("str" in it ? (it as { str: string }).str : ""))
          .join(" "),
      );
    }
    return pages.join("\n").replace(/\s+\n/g, "\n").trim();
  }

  if (name.endsWith(".doc")) {
    throw new Error("Old .doc files aren't supported — save it as .docx or paste the text.");
  }

  throw new Error("Unsupported file — use PDF, Word (.docx), or a text file.");
}
