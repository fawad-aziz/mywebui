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
      'Create a new file or update an existing file. Use this whenever the user asks you to write, draft, generate, or modify a file (code, scripts, documents, markdown, JSON, config, etc.). Each call writes exactly one file, and many files can coexist in the same conversation. Creating a new file never requires deleting or modifying existing files. The content parameter is the complete file; when updating, any previous content of that file is fully replaced.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update'],
          description: '"create" for a new file, "update" to change an existing file.',
        },
        filename: {
          type: 'string',
          description: 'A simple file name without folders or path separators, e.g. "report.md" or "server.py".',
        },
        content: {
          type: 'string',
          description: 'The complete file content. Always the full file, never a partial edit or diff.',
        },
      },
      required: ['action', 'filename', 'content'],
    },
  },
};

export const FILE_SYSTEM_NOTE = [
  'You have access to the file tool. Use it whenever the user asks you to write, draft, generate, or modify a file such as code, scripts, documents, markdown, JSON, or configuration.',
  'Rules for the file tool:',
  '- Use action "create" for new files and "update" for existing files. The content field always carries the complete file; the previous content is fully replaced.',
  '- Always send the complete file content in "content". Never send partial content, fragments, or diffs.',
  '- Use simple file names without folders or path separators, e.g. "report.md" or "server.py".',
  '- A conversation can hold many files at once. Each file is independent: creating a new file does NOT require deleting, renaming, or updating any existing file, and it does not touch them.',
  '- Give every new file its own distinct filename. If the user asks for another or a new file while files already exist, call the tool again with a new filename — never tell the user to delete an existing file first.',
  '- Files are stored in the user\'s browser and can be viewed and downloaded from the Files panel in the chat.',
  '- After creating or updating files, briefly confirm to the user which files you wrote and what they contain.',
  'If the user does not ask for a file, answer normally without calling the tool.',
].join('\n');

const MAX_FILE_CHARS = 200000;
const MAX_FILES_PER_CONVERSATION = 30;

function fileToolFailure(message) {
  return { error: message, resultText: `File tool error: ${message}` };
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

  if (!filename || filename.length > 120 || /[/\\]/.test(filename) || filename.includes('\u0000')) {
    return fileToolFailure(`Invalid file name "${filename}". Use a simple name without folders or path separators, e.g. "report.md".`);
  }
  if (!['create', 'update'].includes(action)) {
    return fileToolFailure(`Invalid action "${args?.action}". Use "create" for new files or "update" for existing ones.`);
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
 * Convert persisted conversation messages into the API message array,
 * including tool-call / tool-result entries in provider-native format.
 */
export function toApiMessages(messages, provider) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
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
