import { useState } from 'react';
import { PROVIDERS, listModels } from '../lib/providers.js';

export default function SettingsModal({ initial, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...initial }));
  const [models, setModels] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const changeProvider = (providerId) => {
    setDraft((prev) => ({
      ...prev,
      provider: providerId,
      baseUrl: prev.baseUrl === PROVIDERS[prev.provider].defaultUrl
        ? PROVIDERS[providerId].defaultUrl
        : prev.baseUrl,
      model: '',
    }));
    setModels([]);
    setFetchError(null);
  };

  const fetchModels = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const found = await listModels(draft);
      setModels(found);
      if (!draft.model && found.length > 0) setDraft((prev) => ({ ...prev, model: found[0] }));
      if (found.length === 0) setFetchError('Connected, but no models were found. Pull a model or start the server with one loaded.');
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const searchOn = Boolean(draft.searchEnabled);
  const needsApiKey = Boolean((PROVIDERS[draft.provider] || {}).requiresApiKey);
  const canSave = Boolean(draft.baseUrl.trim() && draft.model.trim() && (!needsApiKey || (draft.apiKey || '').trim()));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          <span>Provider</span>
          <select
            value={draft.provider}
            onChange={(event) => changeProvider(event.target.value)}
          >
            {Object.values(PROVIDERS).map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Server URL</span>
          <input
            type="text"
            value={draft.baseUrl}
            placeholder={PROVIDERS[draft.provider].defaultUrl}
            onChange={(event) => setDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Model</span>
          <div className="model-row">
            <input
              className="model-input"
              list="model-options"
              value={draft.model}
              placeholder="e.g. llama3.2, qwen2.5, mistral"
              onChange={(event) => setDraft((prev) => ({ ...prev, model: event.target.value }))}
              spellCheck={false}
            />
            <datalist id="model-options">
              {models.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button type="button" className="secondary-btn" onClick={fetchModels} disabled={fetching || !draft.baseUrl.trim()}>
              {fetching ? 'Fetching…' : 'Fetch models'}
            </button>
          </div>
        </label>

        {fetchError && <div className="modal-error">{fetchError}</div>}

        {needsApiKey && (
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={draft.apiKey || ''}
              placeholder="sk-unsloth-…"
              onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
              spellCheck={false}
            />
          </label>
        )}

        <label className="field">
          <span>Temperature: {Number(draft.temperature).toFixed(1)}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={draft.temperature}
            onChange={(event) => setDraft((prev) => ({ ...prev, temperature: Number(event.target.value) }))}
          />
        </label>

        <div className="search-section">
          <label className="check">
            <input
              type="checkbox"
              checked={searchOn}
              onChange={(event) => setDraft((prev) => ({ ...prev, searchEnabled: event.target.checked }))}
            />
            Enable web search
          </label>
          {searchOn && (
            <label className="field">
              <span>Tavily API key</span>
              <input
                type="password"
                value={draft.tavilyKey || ''}
                placeholder="tvly-…"
                onChange={(event) => setDraft((prev) => ({ ...prev, tavilyKey: event.target.value }))}
                spellCheck={false}
              />
            </label>
          )}
          <div className="provider-hint">
            The model can call a web_search tool (via Tavily, free tier: 1,000 searches/month at tavily.com) when it needs
            current information, then answers with cited sources. Requires a tool-capable model — e.g. llama3.1/3.2/3.3,
            qwen2.5/3, mistral, gemma3. If your model doesn't support tools, the app falls back to plain chat automatically.
            Your key is stored only in this browser.
          </div>
        </div>

        <div className="search-section">
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(draft.filesEnabled)}
              onChange={(event) => setDraft((prev) => ({ ...prev, filesEnabled: event.target.checked }))}
            />
            Enable file tools
          </label>
          <div className="provider-hint">
            The model can create and update files (code, documents, markdown, JSON, config) with a file tool. Files are
            saved in this browser per conversation and can be previewed, downloaded, or deleted from the Files panel in
            the chat. Requires a tool-capable model — if your model doesn't support tools, the app falls back to plain
            chat automatically.
          </div>
        </div>

        <div className="search-section">
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(draft.calcEnabled)}
              onChange={(event) => setDraft((prev) => ({ ...prev, calcEnabled: event.target.checked }))}
            />
            Enable calculator
          </label>
          <div className="provider-hint">
            The model gets a calculate tool for exact arithmetic — percentages, discounts, exponents, roots, trig —
            evaluated locally in your browser, so no extra math ever depends on the model's (often wrong) mental math.
            Requires a tool-capable model — if your model doesn't support tools, the app falls back to plain chat
            automatically.
          </div>
        </div>

        <div className="search-section">
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(draft.fetchEnabled)}
              onChange={(event) => setDraft((prev) => ({ ...prev, fetchEnabled: event.target.checked }))}
            />
            Enable page fetch
          </label>
          <div className="provider-hint">
            The model gets a fetch_url tool that reads the full text of a web page by URL (pairs well with web search:
            search finds pages, fetch reads them). Some sites block cross-origin browser requests (CORS) or serve
            non-text files like PDFs — those pages can't be read, and the model will say so. Requires a tool-capable
            model — if your model doesn't support tools, the app falls back to plain chat automatically.
          </div>
        </div>

        <div className="provider-hint">{PROVIDERS[draft.provider].hint}</div>

        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button
            className="primary-btn"
            disabled={!canSave || (searchOn && !(draft.tavilyKey || '').trim())}
            onClick={() => onSave({ ...draft, baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), tavilyKey: (draft.tavilyKey || '').trim(), apiKey: (draft.apiKey || '').trim() })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
