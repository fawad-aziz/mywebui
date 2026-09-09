const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/**
 * Run a web search via the Tavily API (called directly from the browser).
 * Returns { query, answer, results: [{title, url, snippet}] }.
 */
export async function tavilySearch(apiKey, query, { maxResults = 5, signal } = {}) {
  if (!apiKey) throw new Error('No Tavily API key configured. Open Settings and add one.');
  if (!query) throw new Error('Empty search query.');

  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: true,
    }),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.detail?.[0]?.msg || parsed?.detail?.error || parsed?.detail || parsed?.message || text;
      } catch {
        detail = text;
      }
      if (res.status === 401 || res.status === 403) detail = 'invalid or expired API key';
    } catch {
      /* ignore */
    }
    const err = new Error(`Tavily request failed (${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ''})`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const results = (data.results || []).map((r) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: (r.content || '').slice(0, 500),
  }));
  return { query, answer: data.answer || null, results };
}

/**
 * Format a search result as text to feed back to the model as the tool output.
 */
export function formatSearchResultForModel(result) {
  const lines = [
    `Live web search results for "${result.query}" (retrieved just now, at the current date):`,
    'These results supersede your training knowledge for anything they cover. Report what they say; do not judge them against what you previously knew.',
  ];
  if (result.answer) {
    lines.push(`Direct answer: ${result.answer}`, '');
  }
  (result.results || []).forEach((r, index) => {
    lines.push(`${index + 1}. ${r.title}`, `   URL: ${r.url}`, `   ${r.snippet}`);
  });
  if (!result.results || result.results.length === 0) {
    lines.push('(no results found)');
  }
  lines.push('');
  lines.push(
    'Answer the user using only these results for the facts they cover. Do not add opinions about whether the results are correct or incorrect. Cite the sources you relied on, including their URLs.',
  );
  return lines.join('\n');
}
