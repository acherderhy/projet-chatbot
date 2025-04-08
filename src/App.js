// Importations et configuration
import React, { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.entry";
import mammoth from "mammoth";
import Tesseract from "tesseract.js"; // Importez Tesseract.js

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const translate = async (text) => text;

// Composant principal
function App() {
  // États et références
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  // Fonctions utilitaires
  const formatConversationDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const oneDay = 86400000;

    if (diff < oneDay && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } else if (diff < 2 * oneDay && date.getDate() === now.getDate() - 1) {
      return "Hier";
    } else if (diff < 3 * oneDay && date.getDate() === now.getDate() - 2) {
      return "Avant-hier";
    } else {
      return date.toLocaleDateString("fr-FR");
    }
  };

  const summarize = (text) => {
    if (!text) return "Discussion sans titre";
    const trimmed = text.trim();
    return trimmed.length > 100 ? trimmed.slice(0, 97) + "…" : trimmed;
  };

  const handleRenameConversation = (id, newName) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === id ? { ...conv, name: newName } : conv
      )
    );
  };

  // Effet pour réinitialiser l'état au chargement
  useEffect(() => {
    // Reset chatbot state completely on each page load
    localStorage.clear(); // ensure no persisted state
    setInput("");
    setMessages([]);
    setConversations([]);
    setCurrentConversationId(null);
  }, []);

  

  const currentConversation = conversations.find(
    (c) => c.id === currentConversationId
  );
  const msgs = currentConversation?.messages || [];

  // Fonction pour envoyer un message
  const sendMessage = async () => {
    const systemPrompt = {
      role: "system",
      content: "Tu es un assistant professionnel, clair et neutre, qui répond de manière simple à tout type d'utilisateur, sans supposer de connaissances en programmation."
    };

    if (!input.trim()) return;

    const newMessage = { sender: "user", text: input };
    let activeConvId = currentConversationId;
    if (!activeConvId) {
      const newId = Date.now();
      const newConversation = {
        id: newId,
        name: "Nouvelle discussion",
        messages: [],
      };
      setConversations(prev => [...prev, newConversation]);
      setCurrentConversationId(newId);
      activeConvId = newId;
    }

    setConversations(prev => {
      return prev.map((conv) => {
        if (conv.id === activeConvId) {
          return {
            ...conv,
            messages: [...(conv.messages || []), newMessage],
          };
        }
        return conv;
      });
    });

    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            systemPrompt,
            ...(conversations.find(c => c.id === activeConvId)?.messages || []).map((msg) => ({
              role: msg.sender === "user" ? "user" : "assistant",
              content: msg.text
            })) || [],
            {
              role: "user",
              content: `[mode: fun] ${await translate(input)}`
            }
          ]
        }),
      });
      const data = await res.json();
      if (data.response) {
        const botMessage = { sender: "bot", text: data.response };
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeConvId) {
              return {
                ...conv,
                messages: [...(conv.messages || []), botMessage],
              };
            }
            return conv;
          })
        );

        if (voiceEnabled && !speechSynthesis.speaking) {
          const utterance = new SpeechSynthesisUtterance(data.response);
          speechSynthesis.speak(utterance);
        }
      } else {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeConvId) {
              return {
                ...conv,
                messages: [
                  ...conv.messages,
                  {
                    sender: "bot",
                    text: "❌ Erreur : " + data.error,
                  },
                ],
              };
            }
            return conv;
          })
        );
      }
    } catch (error) {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === activeConvId) {
            return {
              ...conv,
              messages: [
                ...conv.messages,
                {
                  sender: "bot",
                  text: "❌ Erreur de connexion au serveur.",
                },
              ],
            };
          }
          return conv;
        })
      );
    }
    setLoading(false);
  };

  // Fonction pour lire un fichier
  const handleFileRead = async (file) => {
    console.log("Nom du fichier :", file.name);
    console.log("Type du fichier :", file.type);

    const newMessage = { sender: "user", text: `📎 Lecture du fichier : ${file.name}` };
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: [...(conv.messages || []), newMessage],
          };
        }
        return conv;
      })
    );

    try {
      if (file.type.startsWith("image/")) {
        console.log("Lecture d'une image...");
        const imageUrl = URL.createObjectURL(file);

        // Utilisez Tesseract.js pour effectuer l'OCR
        const { data: { text } } = await Tesseract.recognize(imageUrl, "eng", {
          logger: (info) => console.log(info), // Affichez les logs de progression
        });

        console.log("Texte extrait de l'image :", text);
        const botMessage = { sender: "bot", text: `Texte extrait de l'image :\n${text}` };
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === currentConversationId) {
              return {
                ...conv,
                messages: [...(conv.messages || []), botMessage],
              };
            }
            return conv;
          })
        );
      } else if (file.type === "text/plain") {
        console.log("Lecture d'un fichier texte...");
        const text = await file.text();
        console.log("Contenu du fichier :", text);
        const botMessage = { sender: "bot", text: `Contenu du fichier :\n${text}` };
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === currentConversationId) {
              return {
                ...conv,
                messages: [...(conv.messages || []), botMessage],
              };
            }
            return conv;
          })
        );
      } else if (file.type === "application/pdf") {
        console.log("Lecture d'un fichier PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item) => item.str).join(" ") + "\n";
        }
        const botMessage = { sender: "bot", text: `Contenu du fichier PDF :\n${text}` };
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === currentConversationId) {
              return {
                ...conv,
                messages: [...(conv.messages || []), botMessage],
              };
            }
            return conv;
          })
        );
      } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        console.log("Lecture d'un fichier Word...");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        console.log("Contenu du fichier Word :", result.value);
        const botMessage = { sender: "bot", text: `Contenu du fichier Word :\n${result.value}` };
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === currentConversationId) {
              return {
                ...conv,
                messages: [...(conv.messages || []), botMessage],
              };
            }
            return conv;
          })
        );
      } else {
        console.log("Type de fichier non pris en charge.");
        const botMessage = { sender: "bot", text: "❌ Type de fichier non pris en charge." };
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === currentConversationId) {
              return {
                ...conv,
                messages: [...(conv.messages || []), botMessage],
              };
            }
            return conv;
          })
        );
      }
    } catch (error) {
      const botMessage = { sender: "bot", text: `❌ Erreur lors de la lecture du fichier : ${error.message}` };
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === currentConversationId) {
            return {
              ...conv,
              messages: [...(conv.messages || []), botMessage],
            };
          }
          return conv;
        })
      );
    }
  };

  // Fonction pour gérer le téléchargement de fichiers
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileRead(file);
    }
  };

  // Reintroduce the style from screenshot #2 (gradient, transitions, etc.)
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        fontFamily: "Poppins, sans-serif",
        background: darkMode
          ? "linear-gradient(135deg, #1e1e1e, #121212)"
          : "linear-gradient(135deg, #f9f9f9, #ffffff)",
        color: darkMode ? "#fff" : "#000",
        transition: "background 0.5s, color 0.5s",
      }}
    >
      {/* Barre latérale gauche */}
      <div
        style={{
          width: "300px",
          padding: "20px",
          background: darkMode ? "#222" : "#fff",
          borderRight: "1px solid #ddd",
          overflowY: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          boxSizing: "border-box",
        }}
      >
        <h3>📚 Discussions Précédentes</h3>
        <input
          type="text"
          placeholder="🔍 Rechercher une discussion..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "8px",
            marginBottom: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            fontSize: "0.9em",
          }}
        />
        {/* Liste des discussions */}
        {conversations
          .filter((conv) => {
            const title = conv.name || summarize(conv.messages[0]?.text || "");
            return (
              typeof searchTerm === "string" &&
              title.toLowerCase().includes(searchTerm.toLowerCase())
            );
          })
          .map((conv) => (
            <div
              key={conv.id}
              onClick={() => setCurrentConversationId(conv.id)}
              style={{
                margin: "10px 0",
                padding: "10px",
                background: darkMode ? "#333" : "#f9f9f9",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight:
                  conv.id === currentConversationId ? "bold" : "normal",
                borderLeft:
                  conv.id === currentConversationId
                    ? "4px solid #007bff"
                    : "4px solid transparent",
                transition: "transform 0.2s, background 0.5s",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{ fontWeight: "bold", fontSize: "0.9em", cursor: "text" }}
                  onDoubleClick={() => {
                    const newName = prompt(
                      "Renommer la discussion :",
                      conv.name || summarize(conv.messages[0]?.text)
                    );
                    if (newName) handleRenameConversation(conv.id, newName);
                  }}
                >
                  {conv.name || summarize(conv.messages[0]?.text)}
                </span>
                <span style={{ fontSize: "0.7em", opacity: 0.6 }}>
                  {formatConversationDate(conv.id)}
                </span>
              </div>
            </div>
          ))}
        <button
          onClick={() => {
            const newId = Date.now();
            const newConversation = {
              id: newId,
              name: "",
              messages: [],
            };
            setConversations((prev) => [...prev, newConversation]);
            setCurrentConversationId(newId);
          }}
          style={{
            marginTop: "10px",
            padding: "8px 12px",
            background: "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "background 0.3s, transform 0.2s",
          }}
        >
          ➕ Nouvelle discussion
        </button>
      </div>

      {/* Zone principale */}
      <div
        style={{
          marginLeft: "300px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Barre de titre */}
        <div
          style={{
            padding: "10px 20px",
            background: darkMode ? "#444" : "#007bff",
            color: "#fff",
            textAlign: "center",
            fontSize: "1.5em",
            fontWeight: "bold",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          🤖 Mon Chatbot IA
          <button
            onClick={() => setDarkMode((prev) => !prev)}
            style={{
              padding: "10px 15px",
              background: darkMode ? "#555" : "#fff",
              color: darkMode ? "#fff" : "#000",
              border: "none",
              borderRadius: "20px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              transition: "background 0.3s, color 0.3s",
            }}
          >
            {darkMode ? "☀️ Mode clair" : "🌙 Mode sombre"}
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {msgs.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  maxWidth: "60%",
                  padding: "10px 15px",
                  borderRadius: "15px",
                  background: msg.sender === "user"
                    ? (darkMode ? "#375a7f" : "#d1ecf1")
                    : (darkMode ? "#444" : "#f8f9fa"),
                  color: darkMode ? "#fff" : "#000",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
                  whiteSpace: "pre-wrap",
                  position: "relative",
                }}
              >
                {msg.text}
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Uploaded"
                    style={{ maxWidth: "100%", borderRadius: "10px", marginTop: "10px" }}
                  />
                )}
                {msg.sender === "bot" && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.text);
                      setCopiedIndex(i);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                    title="Copier la réponse"
                    style={{
                      position: "absolute",
                      top: "50%",
                      right: "-30px",
                      transform: "translateY(-50%)",
                      background: darkMode ? "#555" : "#ddd",
                      border: "none",
                      borderRadius: "50%",
                      padding: "5px",
                      cursor: "pointer",
                      fontSize: "12px",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    {copiedIndex === i ? "✅" : "📋"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ textAlign: "center", fontStyle: "italic", opacity: 0.7 }}>
              ⏳ Le bot réfléchit...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Barre d'entrée */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            padding: "20px",
            borderTop: "1px solid #ccc",
            background: darkMode ? "#333" : "#fff",
          }}
        >
          <input
            type="file"
            accept=".txt,.pdf,.docx,image/*"
            onChange={handleFileUpload}
            style={{
              flex: "none",
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid #ccc",
              cursor: "pointer",
              background: darkMode ? "#444" : "#fff",
              color: darkMode ? "#fff" : "#000",
            }}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écrivez votre message..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
              }
            }}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              padding: "10px 20px",
              background: "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}


export default App;