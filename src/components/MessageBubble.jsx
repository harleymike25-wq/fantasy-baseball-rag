import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ProbabilityBadge from "./ProbabilityBadge";

function extractScore(text) {
  const match = text.match(/Score:\s*(\d+)\/100/i);
  return match ? parseInt(match[1]) : null;
}

const mdComponents = {
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  p: ({ children }) => <p className="md-p">{children}</p>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
  hr: () => <hr className="md-hr" />,
  code: ({ inline, children }) =>
    inline ? (
      <code className="md-code-inline">{children}</code>
    ) : (
      <pre className="md-pre"><code>{children}</code></pre>
    ),
  table: ({ children }) => (
    <div className="md-table-wrap"><table className="md-table">{children}</table></div>
  ),
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
};

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const score = !isUser ? extractScore(message.content) : null;

  return (
    <div className={`bubble-row ${isUser ? "bubble-row--user" : "bubble-row--ai"}`}>
      {!isUser && (
        <div className="bubble-avatar">⚾</div>
      )}
      <div className={`bubble ${isUser ? "bubble--user" : "bubble--ai"}`}>
        {score !== null && (
          <div style={{ marginBottom: 10 }}>
            <ProbabilityBadge score={score} />
          </div>
        )}
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
