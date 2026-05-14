import { useState, useRef } from "react";
import ChatWindow from "../components/ChatWindow";

export default function ChatPage({ rosterSummary }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  async function sendMessage(text) {
    const userMsg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // roster is passed separately — injected into RAG context, not as a chat message
        body: JSON.stringify({ messages: updated, roster: rosterSummary }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? `Error: ${data.error ?? "Unknown error"}`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Network error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  }

  const activeTeamName = rosterSummary ? "Roster loaded" : "No roster — go to My Team tab";

  return (
    <>
      <ChatWindow messages={messages} loading={loading} />
      <form className="input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about start/sit, waivers, trades, player probability..."
          disabled={loading}
          className="chat-input"
        />
        <button type="submit" disabled={loading || !input.trim()} className="send-btn">
          {loading ? "···" : "Send"}
        </button>
      </form>
    </>
  );
}
