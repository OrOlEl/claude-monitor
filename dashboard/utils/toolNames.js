/**
 * Shared utility: MCP tool name shortening and detail preview extraction.
 * Used by HorizontalTree, ConversationPanel, ActivityLog.
 */

/** Strip MCP server prefixes from tool names for readability */
export function shortenToolName(name) {
  if (!name) return name;
  // Strip mcp__ prefix and server name: mcp__playwright__browser_click → browser_click
  let short = name.replace(/^mcp__[^_]+__/, '');
  // Strip common suffixes
  short = short.replace(/_mcp$/, '');
  // Shorten remaining long prefixes
  short = short.replace(/^browser_/, 'pw:');
  short = short.replace(/^21st_magic_/, '21st:');
  short = short.replace(/^codex_/, 'codex:');
  return short;
}

/** Extract meaningful preview from tool detail string */
export function getDetailPreview(detail, maxLen = 40) {
  if (!detail) return '';
  const lines = detail.split('\n');
  let preview = lines[0] || '';
  // Shorten file paths
  if (preview.includes('/')) {
    const parts = preview.split('/');
    preview = parts.length > 2 ? '.../' + parts.slice(-2).join('/') : preview;
  }
  if (preview.length > maxLen) preview = preview.substring(0, maxLen) + '...';
  return preview;
}
