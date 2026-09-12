// Fetch a web page from the browser and reduce it to readable text
// so it can be fed back to the model as a tool result.
import { extractPdfText } from './pdf.js';

const MAX_PAGE_CHARS = 12000;
const PDF_FETCH_CHARS = 50000;
const DEFAULT_TIMEOUT_MS = 20000;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCode(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeFromCode(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ' ';
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

function htmlToText(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav\s*>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer\s*>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|ul|ol|tr|table|section|article|header|h[1-6]|blockquote|pre|figure|figcaption)>/gi, '\n')
    .replace(/<(br\s*\/?)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  return decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || null;
}

/**
 * Fetch a URL and return { url, title, text, totalChars, truncated }.
 * Throws an Error with a readable message on failure.
 */
export async function fetchPageText(rawUrl, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error(`"${rawUrl}" is not a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are supported (got "${parsed.protocol}").`);
  }
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
    throw new Error(`"${parsed.hostname}" does not look like a valid host.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onOuterAbort = () => controller.abort(signal.reason);
  if (signal) signal.addEventListener('abort', onOuterAbort, { once: true });

  let res;
  try {
    res = await fetch(parsed.href, { signal: controller.signal, redirect: 'follow' });
  } catch (err) {
    if (controller.signal.aborted && signal?.aborted) throw err;
    const timedOut = controller.signal.aborted;
    if (timedOut) throw new Error(`The request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    if (err?.name === 'AbortError') throw new Error('The request was cancelled.');
    throw new Error('Network error — the site may be down, or its browser (CORS) policy blocked the request.');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }

  if (!res.ok) throw new Error(`The server returned HTTP ${res.status} for this URL.`);

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const looksLikePdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"
  if (contentType.includes('pdf') || looksLikePdf) {
    const extracted = await extractPdfText(buffer);
    const truncated = extracted.text.length > PDF_FETCH_CHARS;
    return {
      url: res.url || parsed.href,
      title: `PDF document (${extracted.pages} page${extracted.pages === 1 ? '' : 's'})`,
      text: truncated
        ? `${extracted.text.slice(0, PDF_FETCH_CHARS)}\n… [truncated: showing ${PDF_FETCH_CHARS.toLocaleString()} of ${extracted.text.length.toLocaleString()} characters]`
        : extracted.text,
      totalChars: extracted.totalChars,
      truncated,
    };
  }
  if (contentType && !contentType.startsWith('text/') && !contentType.includes('json') && !contentType.includes('xml')) {
    throw new Error(`Unsupported content type "${contentType.split(';')[0].trim()}". The tool can only read text-based pages (HTML, plain text, JSON, XML) and PDFs with selectable text.`);
  }

  const raw = new TextDecoder().decode(bytes);
  const isHtml = contentType.includes('html') || /<\s*(!doctype|html)/i.test(raw.slice(0, 500));
  const title = isHtml ? pageTitle(raw) : null;
  const text = isHtml ? htmlToText(raw) : decodeEntities(raw).trim();

  if (!text) throw new Error('The page returned no readable text content.');

  const truncated = text.length > MAX_PAGE_CHARS;
  return {
    url: res.url || parsed.href,
    title,
    text: truncated ? `${text.slice(0, MAX_PAGE_CHARS)}\n… [truncated: showing ${MAX_PAGE_CHARS.toLocaleString()} of ${text.length.toLocaleString()} characters]` : text,
    totalChars: text.length,
    truncated,
  };
}

/**
 * Format a fetched page as text to feed back to the model as the tool output.
 */
export function formatPageForModel(page) {
  const lines = [`Page content from ${page.url} (retrieved live, at the current date):`];
  if (page.title) lines.push(`Title: ${page.title}`);
  lines.push(
    'This is the page\'s actual text, fetched just now. It supersedes your training knowledge for whatever it covers.',
    '',
    page.text,
  );
  lines.push('');
  lines.push('Answer the user using this content when it is relevant, and cite the URL. If the content does not answer the question, say so.');
  return lines.join('\n');
}
