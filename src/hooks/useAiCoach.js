import { useState } from "react";
import { supabase } from "../lib/supabase";

// Chat state for the AI health coach. Sends the full message history + light
// app context (dietary filter, cart recipe names) to the ai-coach Edge
// Function on every turn — the API is stateless, same as the underlying
// Claude API (see supabase/functions/ai-coach/index.ts). Auth is re-checked
// server-side in the function itself, so a 401 here is authoritative, not
// just a UI gate.
export function useAiCoach(context) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function sendMessage(text) {
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setSending(true);
    setError(null);

    const { data, error: invokeError } = await supabase.functions.invoke("ai-coach", {
      body: { messages: nextMessages, context },
    });

    if (invokeError) {
      setError("Bir şeyler ters gitti, tekrar dener misin?");
      setSending(false);
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    setSending(false);
  }

  return { messages, sending, error, sendMessage };
}
