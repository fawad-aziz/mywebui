import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PROVIDERS } from '../lib/providers.js';

const SUGGESTIONS = [
  'Explain how transformers work',
  'Write a haiku about the ocean',
  'What are the biggest AI news stories this week?',
  'Help me debug my Python code',
];

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Basic text formats the composer accepts as attachments (prompt context).
const ATTACH_ACCEPT =
  '.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.js,.mjs,.cjs,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.css,.html,.htm,.xml,.yml,.yaml,.toml,.ini,.cfg,.conf,.sh,.bash,.zsh,.ps1,.sql,.log';
const ATTACH_EXT_RE = /\.(txt|md|markdown|csv|tsv|json|jsonl|js|mjs|cjs|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|cs|css|html?|xml|yml|yaml|toml|ini|cfg|conf|sh|bash|zsh|ps1|sql|log)$/i;
const MAX_ATTACHMENT_CHARS = 200000;
const MAX_ATTACHMENTS = 5;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ToolCallPill({ message, isPending }) {
  const first = message.toolCalls?.[0];
  if (first?.name === 'file') {
    const filename = first.arguments?.filename || 'a file';
    const action = String(first.arguments?.action || 'create').toLowerCase();
    const verb = isPending
      ? { create: 'Creating', update: 'Updating', read: 'Reading', list: 'Listing' }[action] || 'Working on'
      : { create: 'Created', update: 'Updated', read: 'Read', list: 'Listed' }[action] || 'Updated';
    const label = action === 'list' ? `${verb} files` : `${verb} file “${filename}”`;
    return (
      <div className="msg msg-tool">
        <div className="tool-pill">
          <span className={`tool-icon${isPending ? ' spin' : ''}`}>📄</span>
          <span>{label}</span>
        </div>
      </div>
    );
  }
  if (first?.name === 'calculate') {
    const expression = String(first.arguments?.expression || 'an expression');
    return (
      <div className="msg msg-tool">
        <div className="tool-pill">
          <span className={`tool-icon${isPending ? ' spin' : ''}`}>🧮</span>
          <span>
            {isPending ? 'Calculating' : 'Calculated'} “{expression.length > 60 ? `${expression.slice(0, 60)}…` : expression}”
          </span>
        </div>
      </div>
    );
  }
  if (first?.name === 'fetch_url') {
    const url = String(first.arguments?.url || 'a page');
    return (
      <div className="msg msg-tool">
        <div className="tool-pill">
          <span className={`tool-icon${isPending ? ' spin' : ''}`}>🌐</span>
          <span>{isPending ? 'Fetching' : 'Fetched'} page {domainOf(url)}</span>
        </div>
      </div>
    );
  }
  const query = first?.arguments?.query || 'the web';
  return (
    <div className="msg msg-tool">
      <div className="tool-pill">
        <span className={`tool-icon${isPending ? ' spin' : ''}`}>🔍</span>
        <span>{isPending ? 'Searching the web' : 'Searched the web'} for “{query}”</span>
      </div>
    </div>
  );
}

function FileToolCard({ message }) {
  const action = message.action || 'create';
  const heading = message.error
    ? 'File tool failed'
    : action === 'update'
      ? 'Updated file'
      : action === 'read'
        ? 'Read file'
        : action === 'list'
          ? 'Listed files'
          : 'Created file';
  return (
    <div className="msg msg-tool">
      <div className={`tool-card${message.error ? ' error' : ''}`}>
        <div className="tool-card-head">
          <span>📄 {heading}</span>
          {message.filename && <span className="tool-card-query">{message.filename}</span>}
        </div>
        {message.error ? (
          <div className="tool-card-error">{message.error}</div>
        ) : (
          action === 'list' ? (
            <div className="file-card-meta">
              <span>{message.resultText?.startsWith('There are no files') ? 'No files yet' : `${message.resultText?.split('\n').length - 1} files in this chat`}</span>
              <span>Open the Files panel to view them</span>
            </div>
          ) : action === 'read' ? (
            <>
              <div className="file-card-meta">
                <span>{message.lines} line{message.lines === 1 ? '' : 's'} · {Number(message.chars || 0).toLocaleString()} characters</span>
                <span>Click the file in the Files panel to view it</span>
              </div>
              <ReadPreview message={message} />
            </>
          ) : (
            <div className="file-card-meta">
              <span>{message.lines} line{message.lines === 1 ? '' : 's'} · {Number(message.chars).toLocaleString()} characters</span>
              <span>Saved to the Files panel</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ReadPreview({ message }) {
  const parts = (message.resultText || '').split('\n\n');
  const full = parts.length >= 2 ? parts.slice(2).join('\n\n') : '';
  if (!full) return null;
  const clipped = full.length > 200;
  return <pre className="tool-card-preview">{clipped ? `${full.slice(0, 200)}…` : full}</pre>;
}

function CalcToolCard({ message }) {
  return (
    <div className="msg msg-tool">
      <div className={`tool-card${message.error ? ' error' : ''}`}>
        <div className="tool-card-head">
          <span>🧮 {message.error ? 'Calculation failed' : 'Calculation'}</span>
          {message.expression && !message.error && <span className="tool-card-query">{message.expression}</span>}
        </div>
        {message.error ? (
          <div className="tool-card-error">{message.error}</div>
        ) : (
          <div className="tool-card-result">{message.resultText}</div>
        )}
      </div>
    </div>
  );
}

function FetchToolCard({ message }) {
  return (
    <div className="msg msg-tool">
      <div className={`tool-card${message.error ? ' error' : ''}`}>
        <div className="tool-card-head">
          <span>🌐 {message.error ? 'Page fetch failed' : 'Fetched page'}</span>
          {message.url && !message.error && <span className="tool-card-query">{domainOf(message.url)}</span>}
        </div>
        {message.error ? (
          <div className="tool-card-error">{message.error}</div>
        ) : (
          <div className="file-card-meta">
            <span>
              {Number(message.chars || 0).toLocaleString()} characters{message.truncated ? ' (truncated)' : ''}
            </span>
            {message.url && (
              <a href={message.url} target="_blank" rel="noreferrer">
                open ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolResultsCard({ message }) {
  if (message.name === 'file') return <FileToolCard message={message} />;
  if (message.name === 'calculate') return <CalcToolCard message={message} />;
  if (message.name === 'fetch_url') return <FetchToolCard message={message} />;
  const results = message.results || [];
  return (
    <div className="msg msg-tool">
      <div className={`tool-card${message.error ? ' error' : ''}`}>
        <div className="tool-card-head">
          <span>
            🔍 {message.error ? 'Web search failed' : `Web search · ${results.length} result${results.length === 1 ? '' : 's'}`}
          </span>
          {message.query && !message.error && <span className="tool-card-query">“{message.query}”</span>}
        </div>
        {message.error ? (
          <div className="tool-card-error">{message.error}</div>
        ) : (
          results.length > 0 && (
            <ul className="tool-results">
              {results.map((r, index) => (
                <li key={`${r.url}-${index}`}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <span className="tool-result-domain">{domainOf(r.url)}</span>
                  {r.snippet && <p className="tool-result-snippet">{r.snippet}</p>}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, isStreamingTail, onPreviewAttachment }) {
  if (message.role === 'tool-call' || message.role === 'tool') return null; // handled by parent

  const isUser = message.role === 'user';
  const label = isUser ? null : PROVIDERS[message.provider]?.label || message.provider || 'model';

  if (!isUser && !message.content && !isStreamingTail) return null;
  const attachments = isUser ? message.attachments || [] : [];

  return (
    <div className={`msg ${isUser ? 'msg-user' : 'msg-assistant'}`}>
      {!isUser && (
        <div className="avatar" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity="0.4" />
            <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6z" />
          </svg>
        </div>
      )}
      <div className="msg-body">
        {!isUser && <div className="msg-label">{label}{message.model ? ` · ${message.model}` : ''}</div>}
        {isUser ? (
          <>
            {message.content && <div className="msg-text">{message.content}</div>}
            {attachments.length > 0 && (
              <div className="msg-attach-list">
                {attachments.map((file) => (
                  <button key={file.id} className="msg-attach" onClick={() => onPreviewAttachment?.(file)} title="View attached file">
                    📎 {file.name} <span className="attach-chip-size">{formatSize(file.content.length)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="markdown">
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : isStreamingTail ? (
              <span className="waiting">Thinking…</span>
            ) : (
              <span className="waiting">(no response)</span>
            )}
            {isStreamingTail && message.content && <span className="cursor" />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat({ conversation, settings, isStreaming, error, onSend, onStop, onOpenSettings, onDismissError, onFileDelete }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState(null);
  const fileInputRef = useRef(null);
  const lastConvIdRef = useRef(conversation?.id);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  });

  // Reset the files panel / preview when switching conversations.
  if (lastConvIdRef.current !== conversation?.id) {
    lastConvIdRef.current = conversation?.id;
    if (filesOpen) setFilesOpen(false);
    if (preview) setPreview(null);
  }

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const submit = () => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;
    stickToBottom.current = true;
    onSend(text, attachments);
    setText('');
    setAttachments([]);
    setAttachError(null);
  };

  const handleFiles = async (fileList) => {
    setAttachError(null);
    if (!fileList || fileList.length === 0) return;
    const next = [...attachments];
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
        break;
      }
      if (!ATTACH_EXT_RE.test(file.name)) {
        setAttachError(`"${file.name}" isn't a supported text format. Try .txt, .md, .csv, .json, or a code file.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_CHARS) {
        setAttachError(`"${file.name}" is too large (max ${MAX_ATTACHMENT_CHARS / 1024} KB per file).`);
        continue;
      }
      try {
        const content = await file.text();
        if (content.slice(0, 8000).includes('\u0000')) {
          setAttachError(`"${file.name}" looks like a binary file, so it can't be attached.`);
          continue;
        }
        next.push({ id: crypto.randomUUID(), name: file.name, size: file.size, content });
      } catch {
        setAttachError(`Could not read "${file.name}".`);
      }
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const provider = PROVIDERS[settings.provider] || PROVIDERS.ollama;
  const configured = Boolean(settings.model);
  const searchOn = Boolean(settings.searchEnabled && settings.tavilyKey);
  const filesOn = Boolean(settings.filesEnabled);
  const calcOn = Boolean(settings.calcEnabled);
  const fetchOn = Boolean(settings.fetchEnabled);
  const files = (conversation && conversation.files) || {};
  const fileNames = Object.keys(files);

  const renderEntry = (message, index, messages) => {
    if (message.role === 'tool-call') {
      const isPending = isStreaming && !(messages[index + 1] && messages[index + 1].role === 'tool');
      return <ToolCallPill key={message.id} message={message} isPending={isPending} />;
    }
    if (message.role === 'tool') {
      return <ToolResultsCard key={message.id} message={message} />;
    }
    const isTail = index === messages.length - 1 && message.role === 'assistant';
    return (
      <MessageBubble
        key={message.id}
        message={message}
        isStreamingTail={isStreaming && isTail}
        onPreviewAttachment={(file) => setPreview({ name: file.name, content: file.content })}
      />
    );
  };

  return (
    <main className="chat">
      <header className="chat-header">
        <div className="chat-title">
          {provider.label}
          {settings.model && <span className="chat-model"> · {settings.model}</span>}
          {searchOn && <span className="chat-search-badge">🔍 web search</span>}
          {filesOn && <span className="chat-files-badge">📄 file tools</span>}
          {calcOn && <span className="chat-files-badge">🧮 calculator</span>}
          {fetchOn && <span className="chat-files-badge">🌐 page fetch</span>}
        </div>
        {fileNames.length > 0 && (
          <div className="files-wrap">
            <button
              className={`files-btn${filesOpen ? ' active' : ''}`}
              onClick={() => setFilesOpen((open) => !open)}
              title="Files created in this chat"
            >
              📄 Files · {fileNames.length}
            </button>
            {filesOpen && (
              <div className="files-panel">
                <div className="files-panel-head">Files in this chat</div>
                <ul className="files-list">
                  {fileNames.map((name) => (
                    <li key={name} className="file-row">
                      <button className="file-name" onClick={() => setPreview({ name, content: files[name].content })} title="Preview">
                        {name}
                      </button>
                      <span className="file-meta">{files[name].content.length.toLocaleString()} chars</span>
                      <button className="file-action" onClick={() => downloadFile(name, files[name].content)} title="Download">
                        ⬇
                      </button>
                      <button className="file-action danger" onClick={() => onFileDelete?.(name)} title="Delete file">
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <button className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {!conversation && (
          <div className="empty-state">
            <h1>How can I help you today?</h1>
            {!configured && (
              <button className="primary-btn configure" onClick={onOpenSettings}>
                Configure your local model →
              </button>
            )}
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} className="suggestion" onClick={() => configured && onSend(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {conversation &&
          conversation.messages.map((message, index) => renderEntry(message, index, conversation.messages))}
      </div>

      {error && (
        <div className="error-bar" onClick={onDismissError} title="Click to dismiss">
          <span className="error-icon">⚠</span> {error}
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" onMouseDown={() => setPreview(null)}>
          <div className="modal file-preview-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="file-preview-head">
              <h2 title={preview.name}>{preview.name}</h2>
              <div className="file-preview-actions">
                <button className="secondary-btn" onClick={() => downloadFile(preview.name, preview.content)}>
                  Download
                </button>
                <button className="secondary-btn" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
            <pre className="file-preview">{preview.content}</pre>
          </div>
        </div>
      )}

      <div className="composer-wrap">
        {attachments.length > 0 && (
          <div className="attach-chips">
            {attachments.map((file) => (
              <span key={file.id} className="attach-chip">
                📎 {file.name} <span className="attach-chip-size">{formatSize(file.size)}</span>
                <button
                  className="attach-chip-remove"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== file.id))}
                  title={`Remove ${file.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer">
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a text file — its content is included in the prompt"
            aria-label="Attach file"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACH_ACCEPT}
            style={{ display: 'none' }}
            onChange={(event) => handleFiles(event.target.files)}
          />
          <textarea
            rows={1}
            value={text}
            placeholder={configured ? 'Message your local model…' : 'Open Settings (gear) to choose a provider and model first.'}
            onChange={(event) => {
              setText(event.target.value);
              const el = event.target;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onKeyDown={onKey}
          />
          {isStreaming ? (
            <button className="stop-btn" onClick={onStop} title="Stop generating">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!text.trim() && attachments.length === 0} title="Send" aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
        <div className={`composer-note${attachError ? ' error-note' : ''}`}>
          {attachError ||
          (searchOn || filesOn || calcOn || fetchOn
            ? [
                searchOn && 'Web search enabled (Tavily) — the model decides when to search. Verify important information.',
                filesOn && 'File tools enabled — the model can create and update files; open the Files panel to view or download them.',
                calcOn && 'Calculator enabled — the model computes exact math with a calculate tool.',
                fetchOn && 'Page fetch enabled — the model can read web pages by URL.',
              ]
                .filter(Boolean)
                .join(' ')
             : 'Responses are generated locally by your model. Verify important information.')}
        </div>
      </div>
    </main>
  );
}
