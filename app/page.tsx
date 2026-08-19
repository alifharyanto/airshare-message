"use client";

import { useState, useRef } from "react";
import { Send, Paperclip, File as FileIcon, Image as ImageIcon, X, Loader2 } from "lucide-react";

type Message = {
  id: string;
  text: string;
  sender: "me" | "other";
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", text: "Halo! Sistem API FX sudah siap. Ada yang mau diuji coba?", sender: "other" },
  ]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() && !selectedFile) return;
    setIsLoading(true);

    const formData = new FormData();
    formData.append("text", inputText);
    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setInputText("");
        setSelectedFile(null);
      } else {
        alert("Terjadi kesalahan dari server.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Gagal mengirim pesan. Pastikan API route tersedia.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50 border-x">
      {/* Header */}
      <div className="bg-slate-800 text-white p-4 flex items-center shadow-md">
        <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center font-bold mr-3">
          FX
        </div>
        <div>
          <h1 className="font-semibold">FX Chat System</h1>
          <p className="text-xs text-slate-300">Online</p>
        </div>
      </div>

      {/* Area Pesan */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[75%] p-3 rounded-2xl flex flex-col ${
              msg.sender === "me"
                ? "bg-blue-600 text-white self-end rounded-br-sm"
                : "bg-white text-gray-800 border self-start rounded-bl-sm"
            }`}
          >
            {/* Render File/Gambar jika ada */}
            {msg.fileUrl && msg.fileType === "image" && (
              <img
                src={msg.fileUrl}
                alt="Attachment"
                className="w-full h-auto rounded-lg mb-2 object-cover max-h-64 bg-white"
              />
            )}
            {msg.fileUrl && msg.fileType === "file" && (
              <a 
                href={msg.fileUrl} 
                target="_blank" 
                rel="noreferrer"
                className={`flex items-center gap-2 p-2 rounded-lg mb-2 hover:opacity-80 transition ${msg.sender === "me" ? "bg-blue-700" : "bg-gray-100"}`}
              >
                <FileIcon size={20} />
                <span className="text-sm truncate underline">{msg.fileName}</span>
              </a>
            )}
            
            {msg.text && <p className="text-sm">{msg.text}</p>}
          </div>
        ))}
      </div>

      {/* Area Input & Upload */}
      <div className="bg-white p-3 flex flex-col border-t">
        {/* Preview file sebelum dikirim */}
        {selectedFile && (
          <div className="flex items-center justify-between bg-gray-100 p-2 rounded-lg mb-2 border border-gray-200">
            <div className="flex items-center gap-2 overflow-hidden text-gray-700">
              {selectedFile.type.startsWith("image/") ? <ImageIcon size={20} /> : <FileIcon size={20} />}
              <span className="text-sm truncate">{selectedFile.name}</span>
            </div>
            <button onClick={() => setSelectedFile(null)} className="text-gray-500 hover:text-red-500 transition">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
            disabled={isLoading}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition disabled:opacity-50"
          >
            <Paperclip size={22} />
          </button>
          
          <input
            type="text"
            placeholder="Ketik pesan..."
            className="flex-1 bg-gray-100 text-gray-800 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={isLoading}
          />
          
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition disabled:opacity-50 disabled:bg-blue-400"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}