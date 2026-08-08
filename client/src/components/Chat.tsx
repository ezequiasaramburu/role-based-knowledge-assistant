import { useEffect, useRef, useState } from "react";
import {
  createChatSession,
  sendChatMessage,
  type ChatMessage,
} from "../lib/api";

interface ChatProps {
  token: string;
}

export function Chat({ token }: ChatProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createChatSession(token)
      .then((session) => setSessionId(session.id))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to start chat session",
        ),
      );
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!sessionId || !question || sending) return;

    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-user`,
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
        sources: [],
      },
    ]);
    setSending(true);

    try {
      const { answer, sources } = await sendChatMessage(
        token,
        sessionId,
        question,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-assistant`,
          role: "assistant",
          content: answer,
          createdAt: new Date().toISOString(),
          sources,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">
            Ask a question about the company to get started.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message chat-message-${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
            {m.sources.length > 0 && (
              <div className="chat-sources">
                {m.sources.map((s) => (
                  <span key={s.id} className="chat-source-tag">
                    {s.title} · {s.department}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-bubble chat-bubble-loading">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error-text chat-error">{error}</p>}

      <form className="chat-input-form" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!sessionId || sending}
        />
        <button type="submit" disabled={!sessionId || sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
