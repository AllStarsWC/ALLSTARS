import { useState, useEffect, useRef } from "react";
import { socket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { MessageSquare, Send } from "lucide-react";

interface ChatMessage {
  username: string;
  message: string;
  timestamp: number;
}

export function Chat({ username }: { username: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg].slice(-100)); // keep last 100
    };

    socket.on("chat-message", handleMessage);
    return () => {
      socket.off("chat-message", handleMessage);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !username) return;
    
    socket.emit("chat-message", { username, message: input.trim() });
    setInput("");
  };

  return (
    <div className="w-full max-w-2xl mx-auto h-[500px] flex flex-col border border-card-border rounded-xl bg-card overflow-hidden">
      <div className="p-3 border-b border-card-border bg-black/20 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="font-bold uppercase tracking-widest text-sm">Stadium Chat</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-xs text-primary">{msg.username}</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {format(msg.timestamp, "HH:mm")}
              </span>
            </div>
            <p className="text-sm text-gray-200 break-words">{msg.message}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm opacity-50">
            No messages yet. Be the first to hype!
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-3 border-t border-card-border bg-black/40 flex gap-2">
        <Input 
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={username ? "Type a message..." : "Set Player ID to chat"}
          disabled={!username}
          className="bg-black/50 border-white/10"
          maxLength={150}
        />
        <Button type="submit" disabled={!input.trim() || !username} size="icon" className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}