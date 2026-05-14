import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";

export default function ChatWindow({ messages, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const EXAMPLES = [
    "Should I start Hoerner or Henderson tonight?",
    "Who should I pick up on waivers this week?",
    "Analyze a trade: I give Devers, I get Julio Rodriguez",
  ];

  return (
    <div className="chat-scroll">
      {messages.length === 0 && (
        <div className="empty-state">
          <div className="icon">⚾</div>
          <h2>Fantasy Baseball AI</h2>
          <p>Ask about start/sit decisions, waiver pickups, trades, or player probability scores.</p>
          {EXAMPLES.map((ex) => (
            <div key={ex} className="empty-chip">"{ex}"</div>
          ))}
        </div>
      )}

      {messages.map((m, i) => (
        <MessageBubble key={i} message={m} />
      ))}

      {loading && (
        <div className="bubble-row bubble-row--ai">
          <div className="bubble-avatar">⚾</div>
          <div className="bubble bubble--ai" style={{ padding: "12px 16px", display: "flex", gap: 5, alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
