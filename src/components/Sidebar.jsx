import { useState } from 'react';

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onOpenSettings,
  settingsLabel,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [draft, setDraft] = useState('');

  const startRename = (conversation) => {
    setRenamingId(conversation.id);
    setDraft(conversation.title);
  };

  const commitRename = () => {
    if (renamingId) onRename(renamingId, draft);
    setRenamingId(null);
  };

  return (
    <aside className="sidebar">
      <button className="new-chat" onClick={onNew}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>

      <div className="convo-list">
        {conversations.length === 0 && (
          <div className="convo-empty">No conversations yet</div>
        )}
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`convo-item${conversation.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(conversation.id)}
            onDoubleClick={() => startRename(conversation)}
            title={conversation.title}
          >
            {renamingId === conversation.id ? (
              <input
                className="convo-rename"
                value={draft}
                autoFocus
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <span className="convo-title">{conversation.title}</span>
            )}
            <button
              className="convo-delete"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(conversation.id);
              }}
              aria-label="Delete conversation"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="settings-btn" onClick={onOpenSettings}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="settings-label" title={settingsLabel}>{settingsLabel}</span>
        </button>
      </div>
    </aside>
  );
}
