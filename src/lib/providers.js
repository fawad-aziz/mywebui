export const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    defaultUrl: 'http://localhost:11434',
    hint: 'Ollama blocks browser requests by default. Start it with OLLAMA_ORIGINS=* (macOS: ollama serve via an app, or `OLLAMA_ORIGINS=* ollama serve`). Models come from `ollama pull <name>`.',
  },
  'lm-studio': {
    id: 'lm-studio',
    label: 'LM Studio',
    defaultUrl: 'http://localhost:1234',
    hint: 'Start the local server in LM Studio (Developer tab) and enable CORS (Server settings → Allow cross-origin requests / --api-allow-cors).',
  },
  'llama.cpp': {
    id: 'llama.cpp',
    label: 'llama.cpp (llama-server)',
    defaultUrl: 'http://localhost:8080',
    hint: 'Run llama-server with --api-allow-cors so the browser can reach it, e.g. `llama-server -m model.gguf --api-allow-cors`. Tool calling usually also needs `--jinja`.',
  },
  unsloth: {
    id: 'unsloth',
    label: 'Unsloth',
    defaultUrl: 'http://localhost:8000',
    requiresApiKey: true,
    hint:
      'Load a model with Unsloth, e.g. `unsloth run --model <model>` — the console prints the endpoint URL and a one-time API key. Enter that base URL (usually http://localhost:8000), paste the sk-unsloth-… key, and use Fetch models to get the model ID.',
  },
};

export function defaultSettingsFor(providerId) {
  const provider = PROVIDERS[providerId] || PROVIDERS.ollama;
  return {
    provider: providerId,
    baseUrl: provider.defaultUrl,
    model: '',
    temperature: 0.7,
    apiKey: '',
  };
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * JSON headers, plus a Bearer token when an API key is configured
 * (required by Unsloth; ignored by other providers unless one is set).
 */
function authHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  const key = String(settings.apiKey || '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function readError(res) {
  return res
    .text()
    .then((text) => {
      let message;
      try {
        const parsed = JSON.parse(text);
        const detail = parsed?.error?.message || parsed?.error || text;
        message = `Request failed (${res.status}: ${String(detail).slice(0, 300)})`;
      } catch {
        message = `Request failed (${res.status}${text ? `: ${text.slice(0, 200)}` : ''})`;
      }
      const err = new Error(message);
      err.status = res.status;
      throw err;
    })
    .catch((err) => (err instanceof Error ? err : new Error(`Request failed (${res.status})`)));
}

function isNetworkError(err) {
  return err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(err?.message || '');
}

/**
 * Normalize raw tool calls from either provider into
 * [{id, name, arguments(object)}].
 */
function normalizeToolCalls(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((tc, index) => {
    const fn = tc.function || tc;
    let args = fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = fn.name === 'web_search' ? { query: args } : {};
      }
    }
    return {
      id: tc.id || `call_${Date.now()}_${index}`,
      name: fn.name || 'unknown',
      arguments: args || {},
    };
  });
}

/**
 * Fetch the list of model names exposed by the configured server.
 */
export async function listModels(settings, { signal } = {}) {
  const baseUrl = normalizeUrl(settings.baseUrl);
  if (!baseUrl) throw new Error('Enter the server URL first.');

  if (settings.provider === 'ollama') {
    const res = await fetch(`${baseUrl}/api/tags`, { signal });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  }

  const res = await fetch(`${baseUrl}/v1/models`, { headers: authHeaders(settings), signal });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

/**
 * Stream a chat completion.
 * - Calls onDelta(textChunk) as content tokens arrive.
 * - Returns { content, toolCalls }. toolCalls is null unless the model
 *   requested a tool, in which case it is [{id, name, arguments}].
 * - Pass a tools array (e.g. [WEB_SEARCH_TOOL, FILE_TOOL]) to advertise tools.
 * LM Studio and llama.cpp both expose an OpenAI-compatible API; Ollama uses
 * its native NDJSON stream.
 */
export async function chatStream(settings, messages, { signal, onDelta, tools = [] } = {}) {
  const baseUrl = normalizeUrl(settings.baseUrl);
  if (!baseUrl) throw new Error('No server URL configured. Open Settings and set it.');
  if (!settings.model) throw new Error('No model selected. Open Settings and pick a model.');

  const temperature = Number(settings.temperature ?? 0.7);

  if (settings.provider === 'ollama') {
    const body = { model: settings.model, messages, stream: true, options: { temperature } };
    if (tools.length) body.tools = tools;

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) throw await readError(res);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let acc = '';
    let toolCalls = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (parsed.error) throw new Error(parsed.error);
        const message = parsed.message;
        if (message?.content) {
          acc += message.content;
          onDelta(message.content);
        }
        if (message?.tool_calls) toolCalls = message.tool_calls;
      }
    }
    return { content: acc, toolCalls: normalizeToolCalls(toolCalls) };
  }

  // OpenAI-compatible: LM Studio and llama.cpp
  const body = { model: settings.model, messages, stream: true, temperature };
  if (tools.length) body.tools = tools;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: authHeaders(settings),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let acc = '';
  let streamDone = false;
  const toolCallAccum = new Map();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        streamDone = true;
        break;
      }
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error.message || 'Model error');
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.content) {
        acc += delta.content;
        onDelta(delta.content);
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const entry = toolCallAccum.get(tc.index) || { id: '', name: '', arguments: '' };
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.arguments += tc.function.arguments;
          toolCallAccum.set(tc.index, entry);
        }
      }
    }
    if (streamDone) break;
  }
  return { content: acc, toolCalls: normalizeToolCalls([...toolCallAccum.values()]) };
}

export function describeNetworkError(err, settings) {
  if (isNetworkError(err)) {
    const provider = PROVIDERS[settings.provider] || PROVIDERS.ollama;
    return (
      `Could not reach ${normalizeUrl(settings.baseUrl)} (${err.message}). ` +
      `Check that the ${provider.label} server is running and CORS is enabled for it.`
    );
  }
  return err.message || 'Unknown error';
}
