import { formatSearchResultForModel } from './search.js';

/**
 * The web_search tool, defined in the OpenAI function-calling schema.
 * Both Ollama and OpenAI-compatible servers (LM Studio, llama.cpp) accept this shape.
 */
export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for up-to-date information. Use this when the user asks about recent events, current data, news, prices, weather, or anything that may have changed after your training cutoff.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query, written as a short web search phrase.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (1-8). Defaults to 5.',
          minimum: 1,
          maximum: 8,
        },
      },
      required: ['query'],
    },
  },
};

export const SEARCH_SYSTEM_NOTE = [
  'You have access to the web_search tool. Use it whenever the user asks about current events, news, recent developments, prices, sports results, weather, or anything that may have changed after your training cutoff.',
  'When you answer using search results, follow these rules strictly:',
  '- The results were retrieved live from the web just now. They are the most current, authoritative information available to you. Treat them as ground truth for whatever they cover.',
  '- Do NOT agree with, disagree with, validate, or second-guess the results using your own training knowledge. Your training knowledge is outdated and must never be used as a criterion to judge current events.',
  '- If something in the results conflicts with what you previously knew, follow the results. Never say things like "this contradicts what I know" or "I believe that is incorrect".',
  '- Present the information as reported by the sources, and cite the sources you relied on, including their URLs.',
  'If the question does not need current information, answer normally without searching.',
].join('\n');

/**
 * The file tool: lets the model create or update files that are stored in the
 * browser (per conversation) and shown in the Files panel of the chat.
 */
export const FILE_TOOL = {
  type: 'function',
  function: {
    name: 'file',
    description:
      'Create, update, read, or list files. Use this whenever the user asks you to write, draft, generate, or modify a file (code, scripts, documents, markdown, JSON, config, etc.), or when you need to see which files exist in the conversation or what an existing file currently contains. Each call acts on one file, and many files can coexist. Creating a new file never requires deleting or modifying existing files. For create/update the content parameter is the complete file; when updating, any previous content of that file is fully replaced. For read, content is ignored and the tool returns the file\'s current text. For list, both content and filename are ignored and the tool returns every file in the conversation with its size.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'read', 'list'],
          description: '"create" for a new file, "update" to change an existing file, "read" to view an existing file\'s content, "list" to see all files in the conversation.',
        },
        filename: {
          type: 'string',
          description:
            'A simple file name without folders or path separators, e.g. "report.md" or "server.py". Required for create, update, and read; ignore it for list.',
        },
        content: {
          type: 'string',
          description:
            'The complete file content for create/update. Always the full file, never a partial edit or diff. Ignore it for read and list.',
        },
      },
      required: ['action'],
    },
  },
};

export const FILE_SYSTEM_NOTE = [
  'You have access to the file tool. Use it whenever the user asks you to write, draft, generate, or modify a file such as code, scripts, documents, markdown, JSON, or configuration, and whenever you need to know which files exist in this conversation or what an existing file contains.',
  'Rules for the file tool:',
  '- Use action "create" for new files, "update" to change one, "read" to view its current content, and "list" to see all files in the conversation.',
  '- Use action "read" before updating a file you did not create in this conversation, or any time you need to recall or verify what a file currently contains. Reading never modifies the file.',
  '- Use action "list" (with no filename) when you are unsure whether a file already exists before creating or updating it.',
  '- Always send the complete file content in "content". Never send partial content, fragments, or diffs.',
  '- Use simple file names without folders or path separators, e.g. "report.md" or "server.py".',
  '- A conversation can hold many files at once. Each file is independent: creating a new file does NOT require deleting, renaming, or updating any existing file, and it does not touch them.',
  '- Give every new file its own distinct filename. If the user asks for another or a new file while files already exist, call the tool again with a new filename — never tell the user to delete an existing file first.',
  '- Files are stored in the user\'s browser and can be viewed and downloaded from the Files panel in the chat.',
  '- After creating or updating files, briefly confirm to the user which files you wrote and what they contain.',
  'If the user does not ask for a file, answer normally without calling the tool.',
].join('\n');

/**
 * The calculate tool: exact arithmetic, evaluated locally in the browser.
 */
export const CALCULATE_TOOL = {
  type: 'function',
  function: {
    name: 'calculate',
    description:
      'Evaluate an arithmetic expression exactly. Use it for any computation you need to perform: arithmetic, percentages, discounts, conversions, exponents, roots, trigonometry, logarithms. Never estimate math by hand when this tool is available.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            'A single arithmetic expression, e.g. "(2500 * 0.083) / 12" or "sqrt(2) * 100" or "2^10". Supported: + - * / % ^, parentheses, functions sqrt, cbrt, abs, sin, cos, tan, asin, acos, atan, log (base 10), ln, log2, exp, floor, ceil, round, min, max, pow; constants pi, e, tau. Angles are in radians. For "15% of 80" write "80 * 0.15".',
        },
      },
      required: ['expression'],
    },
  },
};

export const CALC_SYSTEM_NOTE = [
  'You have access to the calculate tool, which evaluates arithmetic expressions exactly in the user\'s browser.',
  'Rules for the calculate tool:',
  '- Use it whenever the user asks you to compute a number (arithmetic, percentages, interest, discounts, unit conversions, exponents, roots, trig, logs) instead of doing the math in your head — the tool\'s result is exact and must be reported as-is.',
  '- Write expressions in standard notation: "80 * 0.15", "(1 + 0.04/12)^60", "sqrt(144)". For "percent of" questions, multiply by the decimal (15% of 80 is "80 * 0.15").',
  '- Trigonometry uses radians. log is base 10; use ln for the natural logarithm.',
  '- If the tool reports an error, re-check the expression and retry once; if it still fails, tell the user you could not compute it.',
  '- Only call it for math the user actually asked about; do not use it for trivial or rhetorical numbers.',
].join('\n');

/**
 * The fetch_url tool: read a web page's text content by URL.
 */
export const FETCH_URL_TOOL = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Fetch a web page by URL and return its readable text content (HTML is stripped to plain text, very long pages are truncated). Use it to read the full content of a specific page — e.g. a result returned by web_search, or a link the user shared or mentioned.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full http or https URL of the page to read, e.g. "https://example.com/article".',
        },
      },
      required: ['url'],
    },
  },
};

export const FETCH_SYSTEM_NOTE = [
  'You have access to the fetch_url tool, which reads the live text content of a web page by URL.',
  'Rules for the fetch_url tool:',
  '- Use it when you need the full content of a specific page: a web_search result you want to read in depth, or a URL the user shared or mentioned.',
  '- It returns the page\'s readable text (navigation, scripts, and styling are removed). Very long pages are truncated.',
  '- If a fetch fails (blocked by the site\'s CORS policy, network error, non-text file type such as PDF), briefly say the page could not be read and continue with the information you already have. Do not retry the same URL more than once.',
  '- Cite the URL when you use a page\'s content in your answer.',
].join('\n');

/** System notes that accompany tools — stripped (as a group) if a model rejects tool support. */
export const TOOL_NOTES = [SEARCH_SYSTEM_NOTE, FILE_SYSTEM_NOTE, CALC_SYSTEM_NOTE, FETCH_SYSTEM_NOTE];

const MAX_FILE_CHARS = 200000;
const MAX_FILES_PER_CONVERSATION = 30;
const MAX_READ_CHARS = 12000;

function fileToolFailure(message) {
  return { error: message, resultText: `File tool error: ${message}` };
}

function listFilesText(files) {
  const names = Object.keys(files);
  if (names.length === 0) return 'There are no files in this conversation yet.';
  const lines = names.map((name) => {
    const file = files[name];
    return `- ${name} (${file.content.split('\n').length} line(s), ${file.content.length.toLocaleString()} characters)`;
  });
  return `Files in this conversation (${names.length}):\n${lines.join('\n')}`;
}

/**
 * Apply a file tool call to a conversation's files object.
 * Returns { files, filename, action, lines, chars, resultText } on success,
 * or { error, resultText } on failure.
 */
export function applyFileChange(files, args) {
  const action = String(args?.action || '').trim().toLowerCase();
  const filename = String(args?.filename || '').trim();
  const content = typeof args?.content === 'string' ? args.content : '';

  if (!['create', 'update', 'read', 'list'].includes(action)) {
    return fileToolFailure(`Invalid action "${args?.action}". Use "create", "update", "read", or "list".`);
  }

  if (action === 'list') {
    return { files, action: 'list', resultText: listFilesText(files) };
  }

  if (!filename || filename.length > 120 || /[/\\]/.test(filename) || filename.includes('\u0000')) {
    return fileToolFailure(`Invalid file name "${filename}". Use a simple name without folders or path separators, e.g. "report.md".`);
  }

  if (action === 'read') {
    if (!Object.prototype.hasOwnProperty.call(files, filename)) {
      const message = `No file named "${filename}" in this conversation. Use action "list" to see which files exist.`;
      return { files, action: 'read', filename, error: message, resultText: `File tool error: ${message}` };
    }
    const fileContent = files[filename].content;
    const lines = fileContent.split('\n').length;
    const truncated = fileContent.length > MAX_READ_CHARS;
    const body = truncated ? `${fileContent.slice(0, MAX_READ_CHARS)}\n… [truncated: showing ${MAX_READ_CHARS.toLocaleString()} of ${fileContent.length.toLocaleString()} characters]` : fileContent;
    const resultText = `Current content of file "${filename}" (${lines} line${lines === 1 ? '' : 's'}, ${fileContent.length.toLocaleString()} characters):\n\n${body}`;
    return { files, action: 'read', filename, lines, chars: fileContent.length, truncated, resultText };
  }

  if (!content.trim()) {
    return fileToolFailure(`The content for "${filename}" is empty. Provide the complete file content.`);
  }
  if (content.length > MAX_FILE_CHARS) {
    return fileToolFailure(`The content for "${filename}" is too large (${content.length.toLocaleString()} characters). Split it into multiple smaller files.`);
  }

  const exists = Object.prototype.hasOwnProperty.call(files, filename);
  if (action === 'create' && !exists && Object.keys(files).length >= MAX_FILES_PER_CONVERSATION) {
    return fileToolFailure(`This conversation already has ${MAX_FILES_PER_CONVERSATION} files. Update an existing file or start a new chat.`);
  }

  const now = Date.now();
  const nextFiles = { ...files, [filename]: { content, createdAt: files[filename]?.createdAt || now, updatedAt: now } };
  const lines = content.split('\n').length;
  const verb = exists ? 'updated' : 'created';
  const note =
    action === 'update' && !exists
      ? ' It did not exist before, so it was created.'
      : action === 'create' && exists
        ? ' It already existed, so its previous content was replaced.'
        : '';
  return {
    files: nextFiles,
    filename,
    action: exists ? 'update' : 'create',
    lines,
    chars: content.length,
    resultText: `File "${filename}" ${verb} successfully (${lines} line${lines === 1 ? '' : 's'}, ${content.length.toLocaleString()} characters).${note}`,
  };
}

/**
 * Convert a tool call to provider-native format for the assistant echo message.
 */
export function buildToolCallEcho(provider, toolCalls) {
  if (provider === 'ollama') {
    return {
      role: 'assistant',
      content: '',
      tool_calls: toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.arguments } })),
    };
  }
  return {
    role: 'assistant',
    content: '',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
    })),
  };
}

/**
 * Convert a tool result to provider-native format for the follow-up message.
 */
export function buildToolResultMessage(provider, toolCallId, name, content) {
  if (provider === 'ollama') {
    return { role: 'tool', tool_call_id: toolCallId, name, content };
  }
  return { role: 'tool', tool_call_id: toolCallId, content };
}

/**
 * Expand a user message (optionally with attached files) into the content
 * string that gets sent to the model.
 */
export function buildUserContent(message) {
  const content = message?.content || '';
  const attachments = message?.attachments || [];
  if (attachments.length === 0) return content;
  const parts = [];
  if (content) parts.push(content);
  parts.push('Attached file(s):');
  for (const file of attachments) {
    const lines = file.content.split('\n').length;
    parts.push(
      `\n=== Attached file: ${file.name} (${lines} line${lines === 1 ? '' : 's'}, ${file.content.length.toLocaleString()} characters) ===`,
      file.content,
      `=== End of attached file: ${file.name} ===`,
    );
  }
  return parts.join('\n');
}

/**
 * Convert persisted conversation messages into the API message array,
 * including tool-call / tool-result entries in provider-native format.
 */
export function toApiMessages(messages, provider) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: buildUserContent(m) });
    } else if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: m.content });
    } else if (m.role === 'tool-call') {
      out.push(buildToolCallEcho(provider, m.toolCalls || []));
    } else if (m.role === 'tool') {
      const content =
        m.resultText ??
        (m.error
          ? `Web search failed: ${m.error}`
          : formatSearchResultForModel({ query: m.query, answer: m.answer, results: m.results || [] }));
      out.push(buildToolResultMessage(provider, m.toolCallId, m.name || 'web_search', content));
    }
  }
  return out;
}

/**
 * A short system note with the user's current local date and time.
 * Models have no clock of their own, so this is injected on every request.
 */
export function dateTimeNote() {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  return `The current date and time on the user's device is ${date}, ${time} (${tz}).`;
}
