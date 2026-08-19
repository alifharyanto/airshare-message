"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, File as FileIcon, X, LogOut, Image as ImageIcon, Copy, Check, Users, Clock, Info, Download, AlertCircle, Link, Menu } from "lucide-react";

type Participant = { username: string; status: string; joined_at: string; typing: number };
type Attachment = { url: string; name: string; type: string };
type Message = { id: number; username: string; text: string; attachments: any; type: string; created_at: string };
type Room = { id: string; code: string; name: string; max_users: number; expires_at: string };

export default function App() {
  const [view, setView] = useState<"auth" | "chat">("auth");
  const [authMode, setAuthMode] = useState<"join" | "create">("join");
  const [isLoading, setIsLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [duration, setDuration] = useState("24");
  const [maxUsers, setMaxUsers] = useState("10");

  const [sessionToken, setSessionToken] = useState("");
  const [roomData, setRoomData] = useState<Room | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  const [inputText, setInputText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<Attachment | null>(null);
  
  // State untuk Sidebar Mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. CEK URL & SESSION
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join'); 
    const urlRoomId = urlParams.get('room'); 

    if (joinCode) {
      setAuthMode("join");
      setRoomCode(joinCode);
    }

    const token = sessionStorage.getItem("chat_session_token");

    if (token) {
      fetch(`/api/chat?action=check_session&token=${token}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            if (urlRoomId && urlRoomId !== data.room.id) {
               alert("Sesi tidak cocok! Kamu tidak bisa menggunakan link private orang lain.");
               window.location.href = '/';
               return;
            }
            
            setSessionToken(token);
            setUsername(data.user.username);
            setRoomData(data.room);
            setIsOwner(data.isOwner);
            setView("chat");
            
            if (!urlRoomId) {
              window.history.replaceState(null, '', `/?room=${data.room.id}`);
            }
          } else {
            sessionStorage.removeItem("chat_session_token");
            if (urlRoomId) {
              alert("Akses Ditolak! Sesi telah digunakan atau tidak valid. Silakan gabung via Kode Invite.");
              window.location.href = '/';
            }
          }
          setIsLoading(false);
        }).catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
      if (urlRoomId) {
        alert("Akses Ditolak! Sesi ini milik orang lain. Silakan buat akun/nama baru untuk bergabung.");
        window.location.href = '/';
      }
    }
  }, []);

  // 2. POLLING DATA
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (view === "chat" && sessionToken && roomData) {
      const pollData = async () => {
        const res = await fetch(`/api/chat?action=poll&roomId=${roomData.id}&token=${sessionToken}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages);
          setParticipants(data.participants);
          setIsOwner(data.isOwner);
        } else if (data.expired) {
          alert("Sesi ruangan ini telah diakhiri oleh Pembuat Room (Owner) atau batas waktu telah habis.");
          handleLogout(false);
        }
      };
      pollData();
      interval = setInterval(pollData, 2000);
    }
    return () => clearInterval(interval);
  }, [view, sessionToken, roomData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(duration) > 24 || parseInt(duration) < 1) return alert("Durasi maksimal 24 jam!");
    if (parseInt(maxUsers) < 2) return alert("Minimal 2 peserta!");

    const formData = new FormData();
    formData.append("username", username);
    formData.append("roomName", roomName);
    formData.append("duration", duration);
    formData.append("maxUsers", maxUsers);

    const res = await fetch("/api/chat?action=create_room", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      sessionStorage.setItem("chat_session_token", data.sessionToken);
      window.location.href = `/?room=${data.roomId}`;
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("username", username);
    formData.append("roomCode", roomCode);

    const res = await fetch("/api/chat?action=join_room", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      sessionStorage.setItem("chat_session_token", data.sessionToken);
      window.location.href = `/?room=${data.roomId}`; 
    } else {
      alert(data.error);
    }
  };

  const handleLogout = async (sendLeaveApi = true) => {
    if (sessionToken && sendLeaveApi) {
      const formData = new FormData();
      formData.append("token", sessionToken);
      await fetch("/api/chat?action=leave", { method: "POST", body: formData });
    }
    sessionStorage.removeItem("chat_session_token");
    setSessionToken("");
    window.location.href = '/'; 
  };

  const handleCloseRoom = async () => {
    if (!confirm("Tutup room ini secara paksa? Semua orang akan dikeluarkan seketika.")) return;
    const formData = new FormData();
    formData.append("token", sessionToken);
    await fetch("/api/chat?action=close_room", { method: "POST", body: formData });
    handleLogout(false);
  };

  const handleCopyInviteLink = () => {
    if (roomData) {
      const inviteUrl = `${window.location.origin}/?join=${roomData.code}`;
      navigator.clipboard.writeText(inviteUrl);
      alert("Link Invite Berhasil Disalin!\n\nKirimkan link ini ke temanmu.");
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const formData = new FormData();
    formData.append("token", sessionToken);
    fetch("/api/chat?action=typing", { method: "POST", body: formData });
    typingTimeoutRef.current = setTimeout(() => {}, 3000);
  };

  const handleSend = async () => {
    if (!inputText.trim() && selectedFiles.length === 0) return;
    const formData = new FormData();
    formData.append("token", sessionToken);
    formData.append("text", inputText);
    selectedFiles.forEach((file) => formData.append("files", file));
    setInputText("");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await fetch("/api/chat?action=send_message", { method: "POST", body: formData });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const parseAttachments = (attachments: any): Attachment[] => {
    if (!attachments) return [];
    if (typeof attachments === 'string') { try { return JSON.parse(attachments); } catch { return []; } }
    return attachments;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const renderTextWithCode = (text: string, msgId: number | string) => {
    if (!text) return null;
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).trim();
        const codeId = `${msgId}-code-${index}`;
        return (
          <div key={index} className="relative bg-[#1e1e1e] text-[#d4d4d4] p-3 rounded-lg my-1 shadow-inner text-[13px] font-mono group overflow-hidden">
             <button onClick={() => handleCopy(code, codeId)} className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white transition opacity-0 group-hover:opacity-100">
                {copiedId === codeId ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            <pre className="overflow-x-auto"><code>{code}</code></pre>
          </div>
        );
      }
      return <span key={index} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  const typers = participants.filter(p => p.typing === 1 && p.username !== username);

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-gray-100 text-gray-800 font-medium">Memuat Sesi...</div>;

  // ==== TAMPILAN LOGIN ====
  if (view === "auth") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f0f2f5] px-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold text-[#00a884] mb-2">FX Secure Chat</h1>
            <p className="text-gray-500 text-sm">Sesi terlindungi. Privasi terjaga.</p>
          </div>

          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            <button className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${authMode === "join" ? "bg-white shadow text-[#00a884]" : "text-gray-500"}`} onClick={() => setAuthMode("join")}>Gabung Room</button>
            <button className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${authMode === "create" ? "bg-white shadow text-[#00a884]" : "text-gray-500"}`} onClick={() => setAuthMode("create")}>Buat Room</button>
          </div>

          {authMode === "join" ? (
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
              <input type="text" placeholder="Nama Kamu" required className="w-full border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 px-4 py-3 rounded-xl focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] focus:outline-none transition" value={username} onChange={e => setUsername(e.target.value)} />
              <input type="text" placeholder="Kode Room (Contoh: 12345)" required className="w-full border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 px-4 py-3 rounded-xl focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] focus:outline-none transition tracking-widest font-bold" value={roomCode} onChange={e => setRoomCode(e.target.value)} />
              <button type="submit" className="w-full bg-[#00a884] text-white py-3 rounded-xl font-bold shadow-md hover:bg-[#008f6f] transition mt-2">Masuk Ruangan</button>
            </form>
          ) : (
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
              <input type="text" placeholder="Nama Kamu" required className="w-full border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 px-4 py-3 rounded-xl focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] focus:outline-none transition" value={username} onChange={e => setUsername(e.target.value)} />
              <input type="text" placeholder="Nama Ruangan (Misal: Projek Rahasia)" required className="w-full border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 px-4 py-3 rounded-xl focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] focus:outline-none transition" value={roomName} onChange={e => setRoomName(e.target.value)} />
              
              <div className="flex gap-4 mt-1">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 ml-1">Durasi (Jam) - Max 24</label>
                  <input type="number" min="1" max="24" required className="w-full border border-gray-300 bg-gray-50 text-gray-900 px-4 py-2.5 rounded-xl focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] focus:outline-none transition" value={duration} onChange={e => setDuration(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 ml-1">Maks. Orang</label>
                  <input type="number" min="2" required className="w-full border border-gray-300 bg-gray-50 text-gray-900 px-4 py-2.5 rounded-xl focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] focus:outline-none transition" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} />
                </div>
              </div>
              
              <button type="submit" className="w-full bg-[#00a884] text-white py-3 rounded-xl font-bold mt-4 hover:bg-[#008f6f] transition shadow-md">Buat Ruangan Baru</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- KOMPONEN ISI SIDEBAR ---
  const SidebarContent = () => (
    <>
      <div className="p-4 bg-gray-50 flex flex-col gap-1 border-b">
        <h2 className="font-bold text-xl text-gray-800 truncate">{roomData?.name}</h2>
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-200 w-max px-2 py-1 rounded font-medium">
          <span>Kode:</span> <span className="font-bold text-black tracking-wider text-sm">{roomData?.code}</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 bg-white font-bold text-sm text-[#008069] flex justify-between items-center border-b shadow-sm">
          <div className="flex items-center gap-2"><Users size={18} /> Peserta</div>
          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{participants.filter(p=>p.status==='online').length} / {roomData?.max_users}</span>
        </div>
        
        {participants.map((user, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 border-b border-gray-100 ${user.status === 'left' ? 'opacity-50 grayscale' : ''}`}>
            <img src={`https://ui-avatars.com/api/?name=${user.username}&background=${user.status==='online' ? '00a884' : 'ccc'}&color=fff`} className="w-10 h-10 rounded-full shadow-sm" alt="Avatar" />
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="font-bold text-gray-800 text-sm truncate flex items-center gap-1.5">
                {user.username} {user.username === username && "(Kamu)"}
                {/* LABEL OWNER (Urutan index 0 di DB) */}
                {i === 0 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 uppercase tracking-wider">Owner</span>}
                {user.status === 'left' && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 uppercase tracking-wider">Keluar</span>}
              </span>
              <span className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5"><Clock size={10}/> Join: {formatTime(user.joined_at)}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-4 border-t bg-gray-50 flex flex-col gap-3">
        <button onClick={handleCopyInviteLink} className="w-full flex items-center justify-center gap-2 py-2.5 text-white bg-blue-500 rounded-xl hover:bg-blue-600 font-bold transition shadow-sm">
          <Link size={18}/> Salin Link Invite
        </button>

        <button onClick={() => { handleLogout(); setIsSidebarOpen(false); }} className="w-full flex items-center justify-center gap-2 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 font-bold transition shadow-sm">
          <LogOut size={18}/> {isOwner ? "Keluar & Tutup Room" : "Keluar Room"}
        </button>
        
        {isOwner && (
          <button onClick={handleCloseRoom} className="w-full flex items-center justify-center gap-2 py-2.5 text-white bg-red-500 rounded-xl hover:bg-red-600 font-bold transition shadow-md">
            <AlertCircle size={18}/> Hapus Room
          </button>
        )}
      </div>
    </>
  );

  // ==== TAMPILAN CHAT ====
  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      
      {previewImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm transition-all">
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full hover:bg-red-500 transition"><X size={24} /></button>
          <img src={previewImage.url} alt="Preview" className="max-w-full max-h-[75vh] object-contain shadow-2xl rounded-sm" />
          <div className="mt-6 flex flex-col items-center gap-2">
            <span className="text-white/80 text-sm">{previewImage.name}</span>
            <a href={previewImage.url} download={previewImage.name} className="bg-[#00a884] text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-[#008f6f] shadow-lg">
              <Download size={20} /> Unduh Gambar
            </a>
          </div>
        </div>
      )}

      {/* OVERLAY UNTUK SIDEBAR MOBILE */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* SIDEBAR - DESKTOP & MOBILE */}
      <div className={`fixed inset-y-0 right-0 z-50 w-[80%] max-w-[320px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${isSidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex justify-end p-2 bg-gray-50 border-b">
           <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-gray-500 hover:text-red-500 bg-white rounded-lg border shadow-sm"><X size={20}/></button>
        </div>
        <SidebarContent />
      </div>

      <div className="hidden md:flex w-[350px] flex-col bg-white border-r z-10">
        <SidebarContent />
      </div>

      {/* AREA CHAT UTAMA */}
      <div className="flex-1 flex flex-col relative bg-[#efeae2]">
        
        {/* HEADER */}
        <div className="bg-white px-4 py-3 flex items-center justify-between border-b shadow-sm z-10">
          <div>
            <h1 className="font-bold text-gray-800">{roomData?.name}</h1>
            <div className="hidden md:block text-xs text-gray-500 mt-0.5">Online: {participants.filter(p=>p.status==='online').length} orang</div>
            {/* Munculkan tombol link kecil di HP */}
            <p className="md:hidden text-xs font-mono text-gray-600 font-semibold bg-gray-100 inline-block px-1.5 py-0.5 rounded mt-1 cursor-pointer" onClick={handleCopyInviteLink}>
               Kode: {roomData?.code} (Salin)
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* TOMBOL HAMBURGER MOBILE */}
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-gray-600 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition shadow-sm">
              <Menu size={22} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col gap-3" style={{ backgroundImage: "url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')", backgroundSize: 'cover', backgroundBlendMode: 'overlay', backgroundColor: 'rgba(239, 234, 226, 0.93)' }}>
          {messages.map((msg, idx) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="self-center bg-[#fff5c4] text-[#857038] text-[12px] px-4 py-1.5 rounded-full shadow-sm flex items-center gap-2 font-bold my-2 border border-[#f0e3a6]">
                  <Info size={14} /> {msg.text}
                </div>
              );
            }

            const isMe = msg.username === username;
            const showName = !isMe && (idx === 0 || messages[idx - 1].username !== msg.username || messages[idx - 1].type === 'system');
            const attachments = parseAttachments(msg.attachments);
            const msgCopyId = `msg-${msg.id}`;

            return (
              <div key={msg.id} className={`flex max-w-[85%] md:max-w-[70%] ${isMe ? "self-end" : "self-start"} group`}>
                <div className={`relative px-3 py-2 rounded-xl shadow-sm text-[15px] text-gray-900 ${isMe ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none border border-gray-100"}`}>
                  
                  {showName && <div className="text-[13px] font-bold text-[#ea0038] mb-1">{msg.username}</div>}

                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {attachments.map((file, fIdx) => (
                        file.type === "image" ? (
                          <img key={fIdx} src={file.url} alt="img" onClick={() => setPreviewImage(file)} className="w-56 h-auto rounded-lg object-cover cursor-pointer hover:opacity-90 border border-black/5" />
                        ) : (
                          <a key={fIdx} href={file.url} download={file.name} className={`flex items-center gap-2 p-2 rounded-lg text-sm border w-full ${isMe ? "bg-[#cbf0c4] border-[#aee8a5]" : "bg-gray-50 border-gray-200"} hover:brightness-95 transition`}>
                            <div className="bg-[#00a884] text-white p-2 rounded-full shadow-sm"><FileIcon size={16}/></div> 
                            <span className="truncate font-semibold flex-1">{file.name}</span>
                            <Download size={18} className="text-gray-600"/>
                          </a>
                        )
                      ))}
                    </div>
                  )}

                  {msg.text && <div className="leading-relaxed whitespace-pre-wrap font-medium">{renderTextWithCode(msg.text, msg.id)}</div>}

                  <div className="flex items-center justify-end gap-1 mt-1 float-right clear-both ml-4">
                     {msg.text && (
                       <button onClick={() => handleCopy(msg.text, msgCopyId)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition" title="Salin Teks">
                         {copiedId === msgCopyId ? <Check size={14} className="text-[#00a884]"/> : <Copy size={14}/>}
                       </button>
                     )}
                    <span className="text-[10px] text-gray-500 font-bold">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {typers.length > 0 && (
          <div className="absolute bottom-20 md:bottom-24 left-4 bg-white/95 border border-gray-200 px-4 py-2 rounded-full shadow-md text-sm text-[#00a884] font-bold italic flex items-center gap-2 z-20">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
            </span>
            {typers.map(t => t.username).join(', ')} sedang mengetik
          </div>
        )}

        {selectedFiles.length > 0 && (
          <div className="bg-gray-100/90 backdrop-blur p-2 border-t flex gap-2 overflow-x-auto z-20 shadow-inner">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="bg-white border border-gray-300 p-1.5 rounded-lg flex items-center gap-2 min-w-[140px] shadow-sm">
                {file.type.startsWith("image/") ? <ImageIcon size={18} className="text-[#00a884]"/> : <FileIcon size={18} className="text-gray-600"/>}
                <span className="text-[11px] truncate font-bold text-gray-800 flex-1">{file.name}</span>
                <button onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 bg-red-50 hover:bg-red-100 p-1 rounded-md transition"><X size={14}/></button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-[#f0f2f5] p-3 md:p-4 flex items-end gap-2 z-20 border-t border-gray-200">
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
          <button onClick={() => fileInputRef.current?.click()} className="p-3 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-full transition">
            <Paperclip size={24} />
          </button>
          
          <textarea
            placeholder="Ketik pesan..."
            className="flex-1 bg-white text-gray-900 px-4 py-3.5 rounded-xl max-h-32 min-h-[48px] resize-none focus:outline-none shadow-sm text-[15px] font-medium border border-gray-200 focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition"
            rows={1}
            value={inputText}
            onChange={handleTyping}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          
          <button onClick={handleSend} disabled={!inputText.trim() && selectedFiles.length === 0} className="p-3.5 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] shadow-md disabled:opacity-50 transition mb-0.5">
            <Send size={22} className="ml-1" />
          </button>
        </div>

      </div>
    </div>
  );
}