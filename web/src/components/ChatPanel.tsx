import { useState, type FormEvent } from "react";
import { useChatStream, type ChatMessage } from "../hooks/useChatStream";
import type { ChatLine } from "../types";

const QUICK_PROMPTS = [
  { label: "产地", q: "产地" },
  { label: "检测项", q: "检测项" },
  { label: "规则", q: "规则" },
  { label: "冷链", q: "冷链" },
];

function LineView({ line }: { line: ChatLine }) {
  switch (line.cls) {
    case "lead":
      return <div className="conclusion lead">{line.text}</div>;
    case "conclusion":
      return <div className="conclusion">{line.text}</div>;
    case "disclaimer":
      return <div className="disclaimer">{line.text}</div>;
    case "cmd":
      return <div className="reason-line cmd">{line.text}</div>;
    default:
      return <div className="reason-line">{line.text}</div>;
  }
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg user">
        <div className="msg-bubble">{message.lines.map((l) => l.text).join("")}</div>
      </div>
    );
  }
  return (
    <div className="msg agent">
      <div className="msg-bubble">
        {message.lines.map((line, i) => (
          <LineView key={i} line={line} />
        ))}
        {message.error && <div className="disclaimer">{message.error}</div>}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { messages, ask } = useChatStream();
  const [input, setInput] = useState("");
  const busy = messages.length > 0 && !messages[messages.length - 1].done;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput("");
    ask(text);
  };

  return (
    <aside id="agent" className="panel chat-panel">
      <div className="chat-head">
        <div className="chat-head-icon" aria-hidden="true">
          <img src="/assets/brand-mark.png" alt="" />
        </div>
        <div className="chat-head-text">
          <strong>与 Zhenyan Agent 对话</strong>
          <small>
            <span className="status-dot" title="在线" />
            在线 · 基于真实数据的 AI 助手
          </small>
        </div>
        <button className="chat-collapse" type="button" aria-label="收起">
          ⌃
        </button>
      </div>

      <div className="chat-log" aria-live="polite">
        <div className="msg agent">
          <div className="msg-bubble chat-verdict">
            <div className="cv-pass">
              <span className="cv-icon">✓</span>按当前规则通过
            </div>
            <div className="conclusion lead">这批鱼油 FO-2026-001</div>
            <div className="conclusion">
              基于设备采集、检测报告、冷链记录与链上锚定等多源证据，未发现与规则冲突的异常。
            </div>
            <div className="conclusion">该结论适用于当前公开的规则与数据范围。</div>
            <div className="disclaimer">ⓘ 这是基于现有证据综合判断，并不代表对未来或其他批次的保证。</div>
          </div>
        </div>
        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
      </div>

      <div className="chat-quick">
        <span className="chat-quick-label">你想了解什么？例如：</span>
        {QUICK_PROMPTS.map((p) => (
          <button key={p.label} onClick={() => ask(p.q)} disabled={busy}>
            {p.label}
          </button>
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="你还想了解什么？例如：产地、检测项、规则…"
          autoComplete="off"
          disabled={busy}
        />
        <button type="submit" aria-label="发送" disabled={busy}>
          ➤
        </button>
      </form>
    </aside>
  );
}
