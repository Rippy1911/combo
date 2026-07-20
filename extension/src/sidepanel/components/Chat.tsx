import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PHASE_B_MODELS } from "@combo/shared";
import { get, isUnlocked } from "@combo/vault";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveMessage, updateMessage } from "../lib/conversation-db";
import { onPortMessage, sendPortMessage, useAppStore } from "../store";
import { ByokDialog } from "./ByokDialog";

export function Chat() {
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateMessageContent = useAppStore((s) => s.updateMessageContent);
  const streaming = useAppStore((s) => s.streaming);
  const setStreaming = useAppStore((s) => s.setStreaming);
  const showByok = useAppStore((s) => s.showByok);
  const setShowByok = useAppStore((s) => s.setShowByok);
  const doLock = useAppStore((s) => s.doLock);
  const setPhase = useAppStore((s) => s.setPhase);

  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(PHASE_B_MODELS[0]);
  const [error, setError] = useState<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when message list changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleStop = () => {
    const requestId = activeRequestIdRef.current;
    if (requestId) {
      sendPortMessage({ type: "combo:chat-abort", requestId });
      activeRequestIdRef.current = null;
    }
    setStreaming(false);
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    if (!isUnlocked()) {
      setPhase("unlockDialog");
      return;
    }

    let apiKey: string;
    try {
      apiKey = await get("openrouter-api-key");
    } catch {
      setShowByok(true);
      setError("Add your OpenRouter API key first.");
      return;
    }

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: "",
      createdAt: new Date().toISOString(),
    };

    addMessage(userMsg);
    addMessage(assistantMsg);
    await saveMessage(userMsg);
    await saveMessage(assistantMsg);
    setInput("");
    setError(null);
    setStreaming(true);

    const history = useAppStore
      .getState()
      .messages.filter((m) => m.id !== assistantMsg.id)
      .map((m) => ({ role: m.role, content: m.content }));

    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;

    const cleanup = onPortMessage((msg) => {
      if (msg.requestId !== requestId) return;
      if (msg.type === "combo:chat-chunk") {
        updateMessageContent(assistantMsg.id, msg.content);
        if (msg.done) {
          cleanup();
          activeRequestIdRef.current = null;
          setStreaming(false);
          void updateMessage(assistantMsg.id, msg.content);
        }
      } else if (msg.type === "combo:chat-error") {
        cleanup();
        activeRequestIdRef.current = null;
        setStreaming(false);
        setError(msg.error);
        updateMessageContent(assistantMsg.id, `[Error: ${msg.error}]`);
        void updateMessage(assistantMsg.id, `[Error: ${msg.error}]`);
      }
    });

    sendPortMessage({
      type: "combo:chat-start",
      requestId,
      model,
      messages: history,
      apiKey,
    });
  }, [
    input,
    streaming,
    model,
    addMessage,
    updateMessageContent,
    setStreaming,
    setShowByok,
    setPhase,
  ]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Combo Chat</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowByok(true)}>
            BYOK
          </Button>
          <Button variant="outline" size="sm" onClick={() => void doLock()}>
            Lock
          </Button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Send a message to start chatting with your LLM.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg px-3 py-2 text-sm max-w-[90%] ${
              msg.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {msg.content || (streaming && msg.role === "assistant" ? "…" : "")}
          </div>
        ))}
      </div>

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      <footer className="border-t p-4 space-y-2">
        <Select value={model} onChange={(e) => setModel(e.target.value)}>
          {PHASE_B_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <div className="flex gap-2">
          <Button onClick={() => void handleSend()} disabled={!input.trim() || streaming}>
            Send
          </Button>
          {streaming && (
            <Button variant="outline" onClick={handleStop}>
              Stop
            </Button>
          )}
        </div>
      </footer>

      <ByokDialog open={showByok} onClose={() => setShowByok(false)} />
    </main>
  );
}
