// Client-side PDF text extraction using Mozilla's PDF.js.
// The library is loaded lazily, so it is only downloaded when a PDF is processed.

const MAX_PDF_PAGES = 100;
const MAX_PDF_CHARS = 200000;

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // The legacy build works in both modern browsers and Node (no Promise.try).
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (typeof window !== 'undefined') {
        // Browser (Vite): the worker file is emitted as an asset and referenced by URL.
        const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      } else {
        // Node (tests): point the worker at the installed file.
        const { createRequire } = await import('node:module');
        const { pathToFileURL } = await import('node:url');
        const nodeRequire = createRequire(import.meta.url);
        pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
          nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
        ).href;
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Group a page's text items into lines (by y position) and sort left to right.
 */
export function itemsToLines(items) {
  const lines = [];
  for (const item of items) {
    if (!item.str || !Array.isArray(item.transform)) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) < 2);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, str: item.str });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.parts
        .sort((p, q) => p.x - q.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((text) => text.length > 0);
}

/**
 * Extract the text of a PDF from an ArrayBuffer.
 * Returns { text, pages, pagesRead, totalChars, truncatedChars } or throws an
 * Error with a readable message (bad file, password-protected, no text layer).
 */
export async function extractPdfText(arrayBuffer, { signal } = {}) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
    throw new Error('The file is empty or is not a valid PDF.');
  }
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error('This PDF is password-protected, so it can\'t be read.');
    }
    throw new Error('Could not parse this PDF — it may be corrupted or not a real PDF file.');
  }
  try {
    const pages = doc.numPages;
    const pagesRead = Math.min(pages, MAX_PDF_PAGES);
    const allLines = [];
    for (let pageNumber = 1; pageNumber <= pagesRead; pageNumber++) {
      if (signal?.aborted) throw new Error('Stopped.');
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageLines = itemsToLines(content.items || []);
      if (pageLines.length > 0) {
        allLines.push(`--- Page ${pageNumber} ---`);
        allLines.push(...pageLines);
      }
    }
    let text = allLines.join('\n');
    let truncatedChars = false;
    if (text.length > MAX_PDF_CHARS) {
      text = `${text.slice(0, MAX_PDF_CHARS)}\n… [truncated: showing ${MAX_PDF_CHARS.toLocaleString()} of ${text.length.toLocaleString()} characters]`;
      truncatedChars = true;
    }
    if (!text.trim()) {
      throw new Error('No selectable text found — this PDF appears to be scanned images only.');
    }
    return { text, pages, pagesRead, totalChars: text.length, truncatedChars };
  } finally {
    doc.loadingTask.destroy();
  }
}
