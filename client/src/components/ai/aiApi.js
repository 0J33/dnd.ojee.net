import { SERVER_URL } from '../../socket';

// The server side of the AI features (server/ai/routes.js), signed in with
// the site cookie. The model itself is called from llm.js.

const API = `${SERVER_URL}/api/ai`;

async function req(path, method = 'GET', body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return res.ok || data.error ? data : { error: `HTTP ${res.status}` };
  } catch {
    return { error: 'Network error - is the server up?' };
  }
}

export const MCP_URL = `${SERVER_URL}/mcp`;

export const aiApi = {
  tools: () => req('/tools'),
  call: (name, input, { campaign, autoApply } = {}) => req('/tools/call', 'POST', { name, input, campaign, autoApply }),
  proposals: (campaign, status) => req(`/proposals?campaign=${encodeURIComponent(campaign || '')}${status ? `&status=${status}` : ''}`),
  accept: (id, items, edits) => req(`/proposals/${id}/accept`, 'POST', { items, edits }),
  reject: (id, items) => req(`/proposals/${id}/reject`, 'POST', { items }),
  tokens: () => req('/tokens'),
  makeToken: (opts) => req('/tokens', 'POST', opts),
  updateToken: (id, patch) => req(`/tokens/${id}`, 'PATCH', patch),
  revokeToken: (id) => req(`/tokens/${id}`, 'DELETE'),
  saveNote: (campaign, text, heading, sceneId) => req('/note', 'POST', { campaign, text, heading, sceneId }),
  relayUrl: `${API}/relay`,
};
