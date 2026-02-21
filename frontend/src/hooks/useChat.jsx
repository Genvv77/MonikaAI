import { createContext, useContext, useEffect, useState } from "react";

const backendUrl = "https://monikaai-production.up.railway.app";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  const [message, setMessage] = useState(null);
  const [audioPlayed, setAudioPlayed] = useState(false);

  const getUserId = () => {
    let storedId = localStorage.getItem("monika_user_id");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("monika_user_id", storedId);
    }
    return storedId;
  };

  useEffect(() => {
    const fetchHistory = async () => {
      const userId = getUserId();
      try {
        const res = await fetch(`${backendUrl}/history/${userId}`);
        const history = await res.json();
        const formattedHistory = history.map(msg => ({
          text: msg.content,
          role: msg.role,
          audio: null
        }));
        setMessages(formattedHistory);
      } catch (e) {
        console.error("Erreur historique:", e);
        // Fallback: render an empty chat history array if backend is down
        setMessages([{ role: "assistant", text: "Offline Mode: Cannot fetch history." }]);
      }
    };
    fetchHistory();
  }, []);

  const chat = async (userMessage) => {
    setLoading(true);
    const userId = getUserId();
    setMessages((prev) => [...prev, { text: userMessage, role: "user" }]);

    try {
      const data = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, userId: userId }),
      });
      const resp = await data.json();
      const incomingMessages = resp.messages.map(msg => ({ ...msg, role: "assistant" }));
      setMessages((prev) => [...prev, ...incomingMessages]);
      setLoading(false);
      setAudioPlayed(false);
    } catch (error) {
      console.error("Erreur Chat:", error);
      setLoading(false);
    }
  };

  const deleteMessage = async (index) => {
    const userId = getUserId();
    setMessages((prev) => prev.filter((_, i) => i !== index));
    try {
      await fetch(`${backendUrl}/chat/${userId}/${index}`, { method: "DELETE" });
    } catch (e) { console.error("Erreur suppression:", e); }
  };

  // --- NOUVELLE FONCTION RESET ---
  const resetChat = async () => {
    const userId = getUserId();

    // 1. Vide l'écran
    setMessages([]);
    setMessage(null); // Stop l'audio en cours s'il y en a un

    // 2. Vide le serveur
    try {
      await fetch(`${backendUrl}/history/${userId}`, { method: "DELETE" });
    } catch (e) { console.error("Erreur Reset:", e); }
  };

  useEffect(() => {
    if (!loading && !audioPlayed) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.audio && message !== lastMsg) {
        setMessage(lastMsg);
      }
    }
  }, [messages, loading, audioPlayed, message]);

  const onMessagePlayed = () => {
    setAudioPlayed(true);
    setMessage(null);
  };

  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
        history: messages,
        deleteMessage,
        resetChat, // <--- Export
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within a ChatProvider");
  return context;
};


