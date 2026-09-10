import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Chat from './components/Chat.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { chatStream, describeNetworkError } from './lib/providers.js';
import {
  toApiMessages,
  buildToolCallEcho,
  buildToolResultMessage,
  dateTimeNote,
  SEARCH_SYSTEM_NOTE,
  FILE_SYSTEM_NOTE,
  CALC_SYSTEM_NOTE,
  FETCH_SYSTEM_NOTE,
  TOOL_NOTES,
  WEB_SEARCH_TOOL,
  FILE_TOOL,
  CALCULATE_TOOL,
  FETCH_URL_TOOL,
  applyFileChange,
} from './lib/tools.js';
import { tavilySearch, formatSearchResultForModel } from './lib/search.js';
import { evaluateExpression } from './lib/calculate.js';
import { fetchPageText, formatPageForModel } from './lib/fetchPage.js';
import {
  getInstanceId,
  namespacedKey,
  touchInstance,
  pruneStaleInstances,
  migrateLegacyKeys,
} from './lib/instances.js';

const SETTINGS_KEY = 'localchat:settings';
const CONVOS_KEY = 'localchat:conversations';
const ACTIVE_KEY = 'localchat:active';
const STORAGE_KEYS = [SETTINGS_KEY, CONVOS_KEY, ACTIVE_KEY];

// Each browser tab is its own instance: settings, conversations, and files
// are namespaced per tab, so tabs never clobber each other.
const INSTANCE_ID = getInstanceId();
const ns = (key) => namespacedKey(key, INSTANCE_ID);
migrateLegacyKeys(localStorage, INSTANCE_ID, STORAGE_KEYS);
pruneStaleInstances(localStorage, INSTANCE_ID, STORAGE_KEYS);
const MAX_TOOL_ROUNDS = 5;

const DEFAULT_SETTINGS = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: '',
  temperature: 0.7,
  searchEnabled: false,
  tavilyKey: '',
  filesEnabled: false,
  calcEnabled: false,
  fetchEnabled: false,
  apiKey: '',
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function makeMessage(role, content, extra = {}) {
  return { id: crypto.randomUUID(), role, content, ...extra };
}

export default function App() {
  const [settings, setSettings] = useState(() => load(ns(SETTINGS_KEY), DEFAULT_SETTINGS));
  const [conversations, setConversations] = useState(() => load(ns(CONVOS_KEY), []));
  const [activeId, setActiveId] = useState(() => load(ns(ACTIVE_KEY), null));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(ns(SETTINGS_KEY), JSON.stringify(settings));
    touchInstance(localStorage, INSTANCE_ID);
  }, [settings]);
  useEffect(() => {
    localStorage.setItem(ns(CONVOS_KEY), JSON.stringify(conversations));
    touchInstance(localStorage, INSTANCE_ID);
  }, [conversations]);
  useEffect(() => {
    localStorage.setItem(ns(ACTIVE_KEY), JSON.stringify(activeId));
    touchInstance(localStorage, INSTANCE_ID);
  }, [activeId]);

  const active = conversations.find((c) => c.id === activeId) || null;
  const searchActive = Boolean(settings.searchEnabled && settings.tavilyKey);
  const filesActive = Boolean(settings.filesEnabled);
  const calcActive = Boolean(settings.calcEnabled);
  const fetchActive = Boolean(settings.fetchEnabled);

  const newChat = () => {
    setError(null);
    setActiveId(null);
  };

  const selectChat = (id) => {
    setError(null);
    setActiveId(id);
  };

  const deleteChat = (id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const renameChat = (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
  };

  const setAssistantContent = (convId, msgId, content) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== convId
          ? c
          : {
              ...c,
              updatedAt: Date.now(),
              messages: c.messages.map((m) => (m.id === msgId ? { ...m, content } : m)),
            },
      ),
    );
  };

  const appendMessage = (convId, message) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== convId ? c : { ...c, updatedAt: Date.now(), messages: [...c.messages, message] },
      ),
    );
  };

  const removeMessage = (convId, msgId) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== convId ? c : { ...c, messages: c.messages.filter((m) => m.id !== msgId) },
      ),
    );
  };

  const updateConversationFiles = (convId, files) => {
    setConversations((prev) =>
      prev.map((c) => (c.id !== convId ? c : { ...c, files, updatedAt: Date.now() })),
    );
  };

  const deleteFile = (convId, filename) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const rest = { ...(c.files || {}) };
        delete rest[filename];
        return { ...c, files: rest, updatedAt: Date.now() };
      }),
    );
  };

  const stopStreaming = () => abortRef.current?.abort();

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    if (!settings.baseUrl || !settings.model) {
      setError('Set your provider, server URL, and model in Settings before chatting.');
      setSettingsOpen(true);
      return;
    }

    setError(null);
    const userMsg = makeMessage('user', trimmed);
    const assistantMsg = makeMessage('assistant', '', {
      provider: settings.provider,
      model: settings.model,
    });

    let convId = activeId;
    if (convId) {
      const history = [...active.messages, userMsg, assistantMsg];
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== convId ? c : { ...c, updatedAt: Date.now(), messages: history },
        ),
      );
    } else {
      convId = crypto.randomUUID();
      const title = trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
      setConversations((prev) => [
        { id: convId, title, createdAt: Date.now(), updatedAt: Date.now(), messages: [userMsg, assistantMsg] },
        ...prev,
      ]);
      setActiveId(convId);
    }

    // Build the API message history from the conversation so far (plus this user turn),
    // and collect the tools (web search, file tools, calculator, page fetch) enabled in Settings.
    let history = toApiMessages(active ? active.messages : [], settings.provider);
    history.push({ role: 'user', content: trimmed });

    const activeTools = [];
    if (searchActive) activeTools.push(WEB_SEARCH_TOOL);
    if (filesActive) activeTools.push(FILE_TOOL);
    if (calcActive) activeTools.push(CALCULATE_TOOL);
    if (fetchActive) activeTools.push(FETCH_URL_TOOL);

    const systemNotes = [dateTimeNote()];
    if (searchActive) systemNotes.push(SEARCH_SYSTEM_NOTE);
    if (filesActive) systemNotes.push(FILE_SYSTEM_NOTE);
    if (calcActive) systemNotes.push(CALC_SYSTEM_NOTE);
    if (fetchActive) systemNotes.push(FETCH_SYSTEM_NOTE);
    for (const note of systemNotes) history.unshift({ role: 'system', content: note });

    let files = (active && active.files) || {};

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    let acc = '';
    try {
      let toolRounds = 0;
      for (;;) {
        let result;
        try {
          result = await chatStream(settings, history, {
            signal: controller.signal,
            tools: activeTools,
            onDelta: (delta) => {
              acc += delta;
              setAssistantContent(convId, assistantMsg.id, acc);
            },
          });
        } catch (err) {
          // Some models/servers reject the tools parameter; fall back to plain chat.
          if (activeTools.length && err.status === 400 && /tool|function|schema/i.test(err.message)) {
            activeTools.length = 0;
            history = history.filter(
              (m) => !(m.role === 'system' && TOOL_NOTES.includes(m.content)),
            );
            continue;
          }
          throw err;
        }

        const toolCalls = result.toolCalls;
        if (!toolCalls || toolCalls.length === 0) break;

        if (toolRounds >= MAX_TOOL_ROUNDS) {
          setAssistantContent(convId, assistantMsg.id, `${acc}\n\n*(stopped: tool limit reached)*`);
          break;
        }
        toolRounds += 1;

        history.push(buildToolCallEcho(settings.provider, toolCalls));
        appendMessage(convId, { id: crypto.randomUUID(), role: 'tool-call', toolCalls });

        for (const call of toolCalls) {
          const toolCallId = call.id;
          if (call.name === 'file') {
            const outcome = applyFileChange(files, call.arguments);
            if (!outcome.error) {
              files = outcome.files;
              updateConversationFiles(convId, files);
            }
            history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, outcome.resultText));
            appendMessage(convId, {
              id: crypto.randomUUID(),
              role: 'tool',
              name: 'file',
              toolCallId,
              resultText: outcome.resultText,
              filename: outcome.filename || String(call.arguments?.filename || ''),
              action: outcome.action,
              lines: outcome.lines,
              chars: outcome.chars,
              error: outcome.error,
            });
            continue;
          }

          if (call.name === 'calculate') {
            const expression = String(call.arguments?.expression || '').trim();
            let error = null;
            let resultText;
            try {
              const { formatted } = evaluateExpression(expression);
              resultText = `Result: ${formatted}`;
            } catch (err) {
              error = err.message;
              resultText = `Calculation failed: ${error}`;
            }
            history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, resultText));
            appendMessage(convId, {
              id: crypto.randomUUID(),
              role: 'tool',
              name: 'calculate',
              toolCallId,
              resultText,
              expression,
              error,
            });
            continue;
          }

          if (call.name === 'fetch_url') {
            const url = String(call.arguments?.url || '').trim();
            try {
              const page = await fetchPageText(url, { signal: controller.signal });
              const resultText = formatPageForModel(page);
              history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, resultText));
              appendMessage(convId, {
                id: crypto.randomUUID(),
                role: 'tool',
                name: 'fetch_url',
                toolCallId,
                resultText,
                url: page.url,
                title: page.title,
                chars: page.totalChars,
                truncated: page.truncated,
              });
            } catch (err) {
              if (controller.signal.aborted) throw err;
              const message = err.message || 'Page fetch failed';
              const resultText = `Page fetch failed: ${message}`;
              history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, resultText));
              appendMessage(convId, {
                id: crypto.randomUUID(),
                role: 'tool',
                name: 'fetch_url',
                toolCallId,
                resultText,
                url,
                error: message,
              });
            }
            continue;
          }

          if (call.name !== 'web_search') {
            const available = activeTools.map((tool) => tool.function.name).join(', ') || 'none';
            const message = `Unknown tool "${call.name}". Available tools: ${available}.`;
            history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, message));
            appendMessage(convId, {
              id: crypto.randomUUID(),
              role: 'tool',
              name: call.name,
              toolCallId,
              resultText: message,
              query: call.arguments?.query,
              error: message,
            });
            continue;
          }

          const query = String(call.arguments?.query || '').trim() || trimmed;
          const maxResults = Math.min(8, Math.max(1, Number(call.arguments?.max_results) || 5));
          try {
            const res = await tavilySearch(settings.tavilyKey, query, {
              maxResults,
              signal: controller.signal,
            });
            const resultText = formatSearchResultForModel(res);
            history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, resultText));
            appendMessage(convId, {
              id: crypto.randomUUID(),
              role: 'tool',
              name: call.name,
              toolCallId,
              resultText,
              query: res.query,
              answer: res.answer,
              results: res.results,
            });
          } catch (err) {
            if (controller.signal.aborted) throw err;
            const message = err.message || 'Search failed';
            const resultText = `Web search failed: ${message}`;
            history.push(buildToolResultMessage(settings.provider, toolCallId, call.name, resultText));
            appendMessage(convId, {
              id: crypto.randomUUID(),
              role: 'tool',
              name: call.name,
              toolCallId,
              resultText,
              query,
              error: message,
            });
          }
        }
      }
    } catch (err) {
      const aborted = controller.signal.aborted;
      if (aborted) {
        if (!acc) setAssistantContent(convId, assistantMsg.id, '*(stopped)*');
      } else if (acc) {
        setAssistantContent(convId, assistantMsg.id, `${acc}\n\n*[error: ${describeNetworkError(err, settings)}]*`);
      } else {
        removeMessage(convId, assistantMsg.id);
        setError(describeNetworkError(err, settings));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectChat}
        onNew={newChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsLabel={settings.model || 'Not configured'}
      />
      <Chat
        conversation={active}
        settings={settings}
        isStreaming={isStreaming}
        error={error}
        onSend={sendMessage}
        onStop={stopStreaming}
        onOpenSettings={() => setSettingsOpen(true)}
        onDismissError={() => setError(null)}
        onFileDelete={(filename) => active && deleteFile(active.id, filename)}
      />
      {settingsOpen && (
        <SettingsModal
          initial={settings}
          onSave={(next) => {
            setSettings(next);
            setSettingsOpen(false);
            setError(null);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
