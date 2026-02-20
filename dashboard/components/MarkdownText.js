'use client';

import { useMemo } from 'react';

// Lightweight markdown renderer for monitoring dashboard
// Handles: headers, bold, italic, code blocks, inline code, lists, links, tables, horizontal rules

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text) {
  let html = escapeHtml(text);
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-argo-text">$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong class="font-semibold text-argo-text">$1</strong>');
  // Italic: *text* or _text_ (not inside **)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>');
  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-argo-bg px-1.5 py-0.5 rounded text-xs font-mono text-argo-accent">$1</code>');
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-argo-accent hover:underline" target="_blank" rel="noopener">$1</a>');
  return html;
}

function parseMarkdown(text) {
  if (!text) return [];

  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }

    // Horizontal rule: --- or *** or ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headers: # ## ### ####
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      blocks.push({ type: 'header', level: headerMatch[1].length, content: headerMatch[2] });
      i++;
      continue;
    }

    // Table: | col | col |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i].trim();
        // Skip separator rows (| --- | --- |)
        if (/^\|[\s\-:]+\|/.test(row) && !row.replace(/[\s|\-:]/g, '')) {
          i++;
          continue;
        }
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        blocks.push({ type: 'table', rows: tableRows });
      }
      continue;
    }

    // Unordered list: - item or * item
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list: 1. item
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-empty lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !lines[i].trimStart().startsWith('```') &&
           !lines[i].match(/^#{1,4}\s/) &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+[.)]\s+/.test(lines[i]) &&
           !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) &&
           !/^(\s*[-*_]\s*){3,}$/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

export function MarkdownText({ children, className = '' }) {
  const blocks = useMemo(() => parseMarkdown(children), [children]);

  if (!children) return null;

  // If no markdown structures found, render as plain text
  if (blocks.length === 0) {
    return <pre className={`whitespace-pre-wrap break-words font-sans text-sm ${className}`}>{children}</pre>;
  }

  // Check if content has any markdown formatting
  const hasMarkdown = blocks.some(b => b.type !== 'paragraph');
  if (!hasMarkdown && blocks.length === 1) {
    // Single paragraph, check for inline formatting
    const hasInline = /\*\*|__|`[^`]+`|\[.+\]\(.+\)/.test(children);
    if (!hasInline) {
      return <pre className={`whitespace-pre-wrap break-words font-sans text-sm ${className}`}>{children}</pre>;
    }
  }

  return (
    <div className={`markdown-content space-y-2 text-sm ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'header': {
            const sizes = {
              1: 'text-lg font-bold text-argo-text',
              2: 'text-base font-semibold text-argo-text',
              3: 'text-sm font-semibold text-argo-text',
              4: 'text-sm font-medium text-argo-muted',
            };
            return (
              <div key={idx} className={sizes[block.level] || sizes[3]}
                dangerouslySetInnerHTML={{ __html: renderInline(block.content) }} />
            );
          }

          case 'code':
            return (
              <div key={idx} className="rounded-md overflow-hidden border border-argo-border">
                {block.lang && (
                  <div className="bg-argo-sidebar px-3 py-1 text-xs text-argo-muted border-b border-argo-border">
                    {block.lang}
                  </div>
                )}
                <pre className="bg-argo-bg p-3 overflow-x-auto text-xs font-mono text-argo-text leading-relaxed">
                  {block.content}
                </pre>
              </div>
            );

          case 'ul':
            return (
              <ul key={idx} className="space-y-1 ml-4">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-argo-text">
                    <span className="text-argo-muted mt-1.5 flex-shrink-0 w-1 h-1 rounded-full bg-argo-muted" />
                    <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                  </li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol key={idx} className="space-y-1 ml-4">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-argo-text">
                    <span className="text-argo-muted flex-shrink-0 text-xs mt-0.5">{i + 1}.</span>
                    <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                  </li>
                ))}
              </ol>
            );

          case 'table':
            return (
              <div key={idx} className="overflow-x-auto rounded-md border border-argo-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-argo-sidebar">
                      {(block.rows[0] || []).map((cell, ci) => (
                        <th key={ci} className="px-3 py-1.5 text-left text-argo-muted font-medium border-b border-argo-border"
                          dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.slice(1).map((row, ri) => (
                      <tr key={ri} className="border-b border-argo-border last:border-0 hover:bg-argo-card/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-argo-text"
                            dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'hr':
            return <hr key={idx} className="border-argo-border" />;

          case 'paragraph':
            return (
              <p key={idx} className="text-sm text-argo-text leading-relaxed whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: renderInline(block.content) }} />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
