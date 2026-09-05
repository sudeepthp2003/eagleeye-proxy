import React, { useState } from "react";
import { Copy, Check, Terminal, ChevronRight, ExternalLink } from "lucide-react";

/**
 * Parses inline markdown:
 * - Links: [text](url) -> <a>
 * - Inline code: `code` -> <code>
 * - Bold: **text** or __text__ -> <strong>
 * - Italic: *text* or _text_ -> <em>
 */
function parseInline(text) {
  if (!text) return text;
  if (typeof text !== "string") return text;

  const tokens = [];
  // Matches [link text](url), `code`, **bold**, __bold__, *italic*, _italic_
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;

  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.substring(lastIndex, match.index));
    }

    const item = match[0];
    if (item.startsWith("[") && item.includes("](") && item.endsWith(")")) {
      const closeBracket = item.indexOf("](");
      const linkText = item.substring(1, closeBracket);
      const linkUrl = item.substring(closeBracket + 2, item.length - 1);
      tokens.push(
        <a
          key={`a-${key++}`}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
          style={{
            color: "var(--burp-orange, #ff6633)",
            textDecoration: "underline",
            fontWeight: "600",
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            wordBreak: "break-all"
          }}
        >
          {linkText}
          <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
        </a>
      );
    } else if (item.startsWith("`") && item.endsWith("`")) {
      tokens.push(
        <code key={`code-${key++}`} className="md-inline-code">
          {item.slice(1, -1)}
        </code>
      );
    } else if ((item.startsWith("**") && item.endsWith("**")) || (item.startsWith("__") && item.endsWith("__"))) {
      tokens.push(
        <strong key={`b-${key++}`} className="md-bold">
          {item.slice(2, -2)}
        </strong>
      );
    } else if ((item.startsWith("*") && item.endsWith("*")) || (item.startsWith("_") && item.endsWith("_"))) {
      tokens.push(
        <em key={`i-${key++}`} className="md-italic">
          {item.slice(1, -1)}
        </em>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.substring(lastIndex));
  }

  return tokens.length > 0 ? tokens : text;
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="md-codeblock-container">
      <div className="md-codeblock-header">
        <span className="md-codeblock-lang">
          <Terminal size={11} style={{ marginRight: "5px" }} />
          {language || "code"}
        </span>
        <button className="md-copy-btn" onClick={handleCopy}>
          {copied ? <Check size={11} color="#2ecc71" /> : <Copy size={11} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="md-codeblock-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({ content, className = "" }) {
  if (!content) return null;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeBuffer = [];
  let listBuffer = [];
  let listType = "ul";
  let blockKey = 0;

  const flushList = () => {
    if (listBuffer.length > 0) {
      if (listType === "ol") {
        blocks.push(
          <ol key={`ol-${blockKey++}`} className="md-ordered-list">
            {listBuffer.map((item, idx) => (
              <li key={idx} className="md-list-item">{item}</li>
            ))}
          </ol>
        );
      } else {
        blocks.push(
          <div key={`ul-${blockKey++}`} className="md-structured-list">
            {listBuffer.map((item, idx) => (
              <div key={idx} className="md-list-entry">{item}</div>
            ))}
          </div>
        );
      }
      listBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Code Block boundary
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        flushList();
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        blocks.push(
          <CodeBlock
            key={`code-${blockKey++}`}
            language={codeLanguage}
            code={codeBuffer.join("\n")}
          />
        );
        codeBuffer = [];
        codeLanguage = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // 2. Empty line
    if (!trimmed) {
      flushList();
      continue;
    }

    // 3. Horizontal Rule (---, ***, ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${blockKey++}`} className="md-hr" />);
      continue;
    }

    // 4. Headings (# Title, ## Title, ### Title)
    // Strips all leading `#` characters completely so raw '#' is never shown to user!
    const headerMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
    if (headerMatch && !trimmed.startsWith("#!") && !trimmed.startsWith("#include")) {
      flushList();
      const level = headerMatch[1].length;
      const text = headerMatch[2].trim();
      const HeadingTag = `h${Math.min(level + 1, 6)}`;
      blocks.push(
        <HeadingTag key={`h-${blockKey++}`} className={`md-heading md-h${level}`}>
          {parseInline(text)}
        </HeadingTag>
      );
      continue;
    }

    // Next-line header detection (e.g. Title\n---)
    if (i + 1 < lines.length && /^\-{3,}$/.test(lines[i + 1].trim()) && !trimmed.startsWith("-") && !trimmed.startsWith("•")) {
      flushList();
      blocks.push(
        <div key={`section-h-${blockKey++}`} className="md-section-header">
          <h3 className="md-heading md-h2">{parseInline(trimmed)}</h3>
          <div className="md-section-divider" />
        </div>
      );
      i++; // Skip underline line
      continue;
    }

    // 5. Blockquote / Callout (> Note: ...)
    if (trimmed.startsWith(">")) {
      flushList();
      const quoteText = trimmed.replace(/^>\s*/, "");
      blocks.push(
        <blockquote key={`bq-${blockKey++}`} className="md-blockquote">
          {parseInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // 6. Structured Key-Value Rows (e.g. `• **Definition**: ...`, `- **Key**: ...`, `**Key**: ...`)
    const kvMatch = trimmed.match(/^(?:[-*•\u2022]|\d+\.)?\s*\*\*([^*]+)\*\*:\s*(.*)$/);
    if (kvMatch) {
      const keyName = kvMatch[1].trim();
      const valueText = kvMatch[2].trim();
      listType = "ul";

      if (valueText) {
        listBuffer.push(
          <div className="md-kv-row">
            <span className="md-kv-key">{keyName}</span>
            <span className="md-kv-value">{parseInline(valueText)}</span>
          </div>
        );
      } else {
        // Section Sub-header item like `• **Key Responsibilities**:`
        listBuffer.push(
          <div className="md-kv-section-title">
            <ChevronRight size={12} className="md-kv-icon" />
            <span>{keyName}</span>
          </div>
        );
      }
      continue;
    }

    // 7. Standard Bullet List (- item, * item, • item)
    const bulletMatch = trimmed.match(/^[-*•\u2022]\s+(.*)$/);
    if (bulletMatch) {
      listType = "ul";
      listBuffer.push(
        <div className="md-bullet-item">
          <span className="md-bullet-dot"></span>
          <span>{parseInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    // 8. Ordered List (1. item, 2. item)
    const orderMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (orderMatch) {
      listType = "ol";
      listBuffer.push(parseInline(orderMatch[2]));
      continue;
    }

    // 9. Table Row Detection (| col1 | col2 |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      const tableLines = [trimmed];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|") && lines[i + 1].trim().endsWith("|")) {
        tableLines.push(lines[++i].trim());
      }

      if (tableLines.length >= 2) {
        const headers = tableLines[0].split("|").slice(1, -1).map(s => s.trim());
        const isDivider = /^[:\-\|\s]+$/.test(tableLines[1]);
        const dataRows = (isDivider ? tableLines.slice(2) : tableLines.slice(1)).map(row => 
          row.split("|").slice(1, -1).map(s => s.trim())
        );

        blocks.push(
          <div key={`tbl-${blockKey++}`} className="md-table-wrapper">
            <table className="md-table">
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx}>{parseInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{parseInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 10. Normal Paragraph
    flushList();
    blocks.push(
      <p key={`p-${blockKey++}`} className="md-paragraph">
        {parseInline(trimmed)}
      </p>
    );
  }

  flushList();

  return (
    <div className={`md-rendered-content ${className}`}>
      <style dangerouslySetInnerHTML={{__html: `
        .md-rendered-content {
          font-family: var(--burp-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          font-size: 12.5px;
          line-height: 1.6;
          color: #2c3e50;
        }

        .md-section-header {
          margin: 12px 0 8px 0;
        }

        .md-section-divider {
          height: 1px;
          background: #e2e8f0;
          margin-top: 4px;
          margin-bottom: 10px;
        }

        .md-heading {
          font-weight: 700;
          color: #1e293b;
          margin: 14px 0 6px 0;
          line-height: 1.3;
        }

        .md-h1 { font-size: 15px; color: var(--burp-orange, #ff6633); border-bottom: 1px solid #fed7aa; padding-bottom: 4px; }
        .md-h2 { font-size: 13.5px; color: var(--burp-orange, #ff6633); }
        .md-h3 { font-size: 12.5px; color: #334155; }
        .md-h4 { font-size: 12px; color: #475569; }

        .md-paragraph {
          margin: 0 0 8px 0;
        }

        .md-bold {
          font-weight: 700;
          color: #0f172a;
        }

        .md-italic {
          font-style: italic;
          color: #64748b;
        }

        .md-inline-code {
          font-family: var(--burp-font-mono, Consolas, monospace);
          font-size: 11px;
          background: #f1f5f9;
          color: #e11d48;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }

        .md-structured-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin: 6px 0 10px 0;
        }

        .md-list-entry {
          line-height: 1.5;
        }

        .md-bullet-item {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .md-bullet-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--burp-orange, #ff6633);
          flex-shrink: 0;
          position: relative;
          top: -1px;
        }

        .md-ordered-list {
          margin: 6px 0 10px 0;
          padding-left: 20px;
        }

        .md-ordered-list li {
          margin-bottom: 4px;
        }

        .md-kv-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
          padding: 3px 0;
        }

        .md-kv-key {
          font-weight: 700;
          background: #fff7ed;
          color: #c2410c;
          padding: 1px 7px;
          border-radius: 4px;
          font-size: 11.5px;
          border: 1px solid #ffedd5;
          letter-spacing: 0.2px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }

        .md-kv-value {
          color: #334155;
          flex: 1;
        }

        .md-kv-section-title {
          font-weight: 800;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          margin-bottom: 2px;
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-left: 2px solid var(--burp-orange, #ff6633);
          padding-left: 6px;
        }

        .md-kv-icon {
          color: var(--burp-orange, #ff6633);
        }

        .md-codeblock-container {
          background: #0f172a;
          border-radius: 6px;
          margin: 10px 0;
          overflow: hidden;
          border: 1px solid #1e293b;
        }

        .md-codeblock-header {
          background: #1e293b;
          padding: 5px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #334155;
        }

        .md-codeblock-lang {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          display: flex;
          align-items: center;
        }

        .md-copy-btn {
          background: transparent;
          border: 1px solid #475569;
          color: #cbd5e1;
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }

        .md-copy-btn:hover {
          background: #334155;
          color: white;
          border-color: #64748b;
        }

        .md-codeblock-body {
          padding: 12px;
          margin: 0;
          overflow-x: auto;
          font-family: var(--burp-font-mono, Consolas, monospace);
          font-size: 11px;
          line-height: 1.5;
          color: #38bdf8;
        }

        .md-blockquote {
          border-left: 3px solid var(--burp-orange, #ff6633);
          background: rgba(255, 102, 51, 0.04);
          padding: 6px 12px;
          margin: 8px 0;
          color: #475569;
          font-style: italic;
          border-radius: 0 4px 4px 0;
        }

        .md-hr {
          border: none;
          height: 1px;
          background: #e2e8f0;
          margin: 12px 0;
        }

        .md-table-wrapper {
          overflow-x: auto;
          margin: 10px 0;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
        }

        .md-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
          text-align: left;
        }

        .md-table th {
          background: #f8fafc;
          padding: 6px 10px;
          font-weight: 700;
          color: #334155;
          border-bottom: 1px solid #e2e8f0;
        }

        .md-table td {
          padding: 6px 10px;
          border-bottom: 1px solid #f1f5f9;
          color: #475569;
        }

        .md-table tr:nth-child(even) {
          background: #f8fafc;
        }
      `}} />
      {blocks}
    </div>
  );
}
