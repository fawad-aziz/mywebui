# Local Chat

A ChatGPT-style web UI for chatting with your local models, hosted on **Ollama**, **LM Studio**, **llama.cpp** (`llama-server`), or **Unsloth**. Works from any browser — the app talks directly to the server you point it at (no backend needed).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

## Configure

Click the gear icon (or "Configure your local model"):

1. Pick a **provider** — Ollama, LM Studio, llama.cpp, or Unsloth.
2. Enter the **server URL** (defaults: `http://localhost:11434`, `http://localhost:1234`, `http://localhost:8080`).
3. **Fetch models** to auto-fill the model list, or type any model name yourself.
4. Save, then chat. Settings and conversations persist in `localStorage`.

## CORS — you must enable this once per server

Browsers block cross-origin requests unless the server allows them:

- **Ollama**: set `OLLAMA_ORIGINS=*` before starting, e.g. `OLLAMA_ORIGINS=* ollama serve` (macOS menu-bar app: add it to launchd/env).
- **LM Studio**: enable "Allow cross-origin requests" in the server settings (equivalent to `--api-allow-cors`).
- **llama.cpp**: start with `--api-allow-cors`, e.g. `llama-server -m model.gguf --api-allow-cors`.
- **Unsloth**: its API is authenticated — load a model (e.g. `unsloth run --model <model>`), which prints an endpoint URL and a one-time `sk-unsloth-…` API key, then paste both into Settings. If the browser blocks the request (CORS), check Unsloth's server options for cross-origin support (it is built on llama-server).

## How it works

- **Ollama** → native API: `GET /api/tags` for models, `POST /api/chat` with NDJSON streaming.
- **LM Studio, llama.cpp & Unsloth** → OpenAI-compatible API: `GET /v1/models`, `POST /v1/chat/completions` with SSE streaming (Unsloth sends the API key as a `Bearer` token).

Streaming tokens, stop button, markdown/code rendering, multiple saved conversations, rename (double-click), delete, and per-model temperature are all supported.

## Current date & time

Models have no clock of their own, so the app prepends a short system note with your device's current date, time, and timezone to every request (e.g. "The current date and time on the user's device is Wednesday, September 9, 2026, 2:35 PM (America/Indiana/Indianapolis)."). That lets the model answer "what day is it?" correctly without needing web search.

## Multiple tabs

Each browser tab is a separate instance: its own settings, conversations, and files. You can point different tabs at different providers/models at the same time. A tab keeps its state across reloads; data from closed tabs is cleaned up automatically after 24 hours.

## Web search (optional)

Enable "Web search" in Settings and paste your **Tavily API key** (free at [tavily.com](https://tavily.com) — 1,000 searches/month). The model then gets a `web_search` tool via native tool calling:

- When it needs current information, the model returns a tool call with a query.
- The app runs the search through Tavily (directly from the browser) and feeds the results back to the model.
- The model's final answer cites the sources, and the chat shows the search step plus a card of result links.

Requires a tool-capable model (llama3.1/3.2/3.3, qwen2.5/3, mistral, gemma3, …). If the model or server rejects the `tools` parameter, the app automatically falls back to a normal chat completion. Search history stays in the conversation context, so follow-up questions can reference the results. The API key is stored only in your browser's `localStorage`.

## File tools (optional)

Enable "File tools" in Settings. The model then gets a `file` tool for creating, updating, reading, and listing files:

- Ask it to write something (a script, a document, a config) and it calls the tool with the complete file content.
- Files are stored in your browser, per conversation, and show up in the **Files** panel in the chat header — click a file to preview it, or download / delete it.
- "Update" replaces the whole file (the model always sends full content, never diffs).
- The model can also `read` a file's current content or `list` all files in the conversation — e.g. to check a file before updating it, so it never has to guess what it already wrote.
- All toggles can be combined: the model can search the web, write and read files, compute math, and fetch pages in the same conversation.

## Calculator tool (optional)

Enable "Calculator" in Settings. The model gets a `calculate` tool that evaluates arithmetic expressions **exactly in your browser** — arithmetic, percentages, discounts, exponents, roots, trig (radians), logs. No API key, and expressions never leave your machine. The chat shows each computation with its result, and small models stop fumbling with mental math.

## Page fetch (optional)

Enable "Page fetch" in Settings. The model gets a `fetch_url` tool that reads the full text of a web page by URL (HTML is stripped to plain text, very long pages are truncated at 12,000 characters). It pairs well with web search: search finds pages, fetch reads them in full. Caveats: some sites block cross-origin browser requests (CORS) and non-text files (PDFs, images) can't be read — when a page can't be fetched, the model says so and continues with what it has.
