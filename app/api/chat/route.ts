import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import crypto from "crypto";
// HAPUS import "fs" dan "path" karena dilarang keras oleh Vercel

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "check_session") {
      const token = url.searchParams.get("token");
      const [users]: any = await pool.query(`SELECT * FROM room_participants WHERE session_token = ? AND status = 'online'`, [token]);
      if (users.length === 0) return NextResponse.json({ success: false });

      const roomId = users[0].room_id;
      const [rooms]: any = await pool.query(`SELECT *, (expires_at <= CURRENT_TIMESTAMP) as is_expired FROM rooms WHERE id = ?`, [roomId]);
      if (rooms.length === 0 || rooms[0].is_expired === 1) return NextResponse.json({ success: false, error: "Room sudah expired" });

      const [ownerRows]: any = await pool.query(`SELECT session_token FROM room_participants WHERE room_id = ? ORDER BY id ASC LIMIT 1`, [roomId]);
      const isOwner = ownerRows.length > 0 && ownerRows[0].session_token === token;

      return NextResponse.json({ success: true, room: rooms[0], user: users[0], isOwner });
    }

    if (action === "poll") {
      const roomId = url.searchParams.get("roomId");
      const token = url.searchParams.get("token");

      await pool.query(`UPDATE room_participants SET last_seen = CURRENT_TIMESTAMP WHERE session_token = ?`, [token]);

      const [rooms]: any = await pool.query(`SELECT *, (expires_at <= CURRENT_TIMESTAMP) as is_expired FROM rooms WHERE id = ?`, [roomId]);
      if (rooms.length === 0 || rooms[0].is_expired === 1) return NextResponse.json({ success: false, expired: true });

      const [ownerRows]: any = await pool.query(`SELECT session_token FROM room_participants WHERE room_id = ? ORDER BY id ASC LIMIT 1`, [roomId]);
      const isOwner = ownerRows.length > 0 && ownerRows[0].session_token === token;

      const [messages]: any = await pool.query(`SELECT * FROM room_messages WHERE room_id = ? ORDER BY created_at ASC`, [roomId]);

      const [participants]: any = await pool.query(`
        SELECT username, status, joined_at, 
        (TIMESTAMPDIFF(SECOND, is_typing, CURRENT_TIMESTAMP) < 5) as typing
        FROM room_participants WHERE room_id = ? ORDER BY id ASC
      `, [roomId]);

      return NextResponse.json({ success: true, messages, participants, room: rooms[0], isOwner });
    }

    return NextResponse.json({ success: false, error: "Invalid GET Action" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const formData = await req.formData();

    if (action === "create_room") {
      const username = formData.get("username") as string;
      const roomName = formData.get("roomName") as string;
      const duration = parseInt(formData.get("duration") as string) || 24;
      const maxUsers = parseInt(formData.get("maxUsers") as string) || 10;

      const roomId = crypto.randomBytes(16).toString("hex");
      const roomCode = Math.floor(10000 + Math.random() * 90000).toString(); 
      const sessionToken = crypto.randomBytes(32).toString("hex");

      await pool.query(`INSERT INTO rooms (id, code, name, max_users, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR))`, [roomId, roomCode, roomName, maxUsers, duration]);
      await pool.query(`INSERT INTO room_participants (room_id, username, session_token) VALUES (?, ?, ?)`, [roomId, username, sessionToken]);
      await pool.query(`INSERT INTO room_messages (room_id, username, text, type) VALUES (?, 'System', ?, 'system')`, [roomId, `${username} membuat ruang ini.`]);

      return NextResponse.json({ success: true, roomId, roomCode, sessionToken });
    }

    if (action === "join_room") {
      const username = formData.get("username") as string;
      const roomCode = formData.get("roomCode") as string;

      const [rooms]: any = await pool.query(`SELECT *, (expires_at <= CURRENT_TIMESTAMP) as is_expired FROM rooms WHERE code = ?`, [roomCode]);
      if (rooms.length === 0 || rooms[0].is_expired === 1) return NextResponse.json({ success: false, error: "Kode Room tidak valid atau sudah ditutup!" });
      
      const roomId = rooms[0].id;
      const [currentUsers]: any = await pool.query(`SELECT COUNT(*) as count FROM room_participants WHERE room_id = ? AND status = 'online'`, [roomId]);
      if (currentUsers[0].count >= rooms[0].max_users) return NextResponse.json({ success: false, error: "Ruangan sudah penuh!" });

      const sessionToken = crypto.randomBytes(32).toString("hex");
      await pool.query(`INSERT INTO room_participants (room_id, username, session_token) VALUES (?, ?, ?)`, [roomId, username, sessionToken]);
      await pool.query(`INSERT INTO room_messages (room_id, username, text, type) VALUES (?, 'System', ?, 'system')`, [roomId, `${username} bergabung ke ruangan.`]);

      return NextResponse.json({ success: true, roomId, sessionToken });
    }

    if (action === "send_message") {
      const token = formData.get("token") as string;
      const text = formData.get("text") as string || "";
      const files = formData.getAll("files") as File[];
      
      const [userRows]: any = await pool.query(`SELECT room_id, username FROM room_participants WHERE session_token = ?`, [token]);
      if (userRows.length === 0) return NextResponse.json({ success: false, error: "Sesi tidak valid" });
      
      const { room_id, username } = userRows[0];
      const attachments = [];

      // PERBAIKAN VERCEL: Ubah File menjadi Base64 Text (Tanpa save ke folder)
      for (const file of files) {
        if (file && file.size > 0) {
          // Batasan 2MB agar database TiDB tidak lag
          if (file.size > 2 * 1024 * 1024) continue; 

          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          
          // Konversi ke format Data URI (Base64)
          const mimeType = file.type;
          const base64Data = buffer.toString('base64');
          const dataURI = `data:${mimeType};base64,${base64Data}`;

          attachments.push({ 
            url: dataURI, 
            name: file.name, 
            type: file.type.startsWith("image/") ? "image" : "file" 
          });
        }
      }

      await pool.query(`INSERT INTO room_messages (room_id, username, text, attachments, type) VALUES (?, ?, ?, ?, 'chat')`, [room_id, username, text, JSON.stringify(attachments)]);
      return NextResponse.json({ success: true });
    }

    if (action === "typing") {
      const token = formData.get("token") as string;
      await pool.query(`UPDATE room_participants SET is_typing = CURRENT_TIMESTAMP WHERE session_token = ?`, [token]);
      return NextResponse.json({ success: true });
    }

    if (action === "leave") {
      const token = formData.get("token") as string;
      const [userRows]: any = await pool.query(`SELECT room_id, username FROM room_participants WHERE session_token = ?`, [token]);
      
      if (userRows.length > 0) {
        const { room_id, username } = userRows[0];
        const [ownerRows]: any = await pool.query(`SELECT session_token FROM room_participants WHERE room_id = ? ORDER BY id ASC LIMIT 1`, [room_id]);
        const isOwner = ownerRows.length > 0 && ownerRows[0].session_token === token;

        if (isOwner) {
          await pool.query(`UPDATE rooms SET expires_at = CURRENT_TIMESTAMP WHERE id = ?`, [room_id]);
          await pool.query(`INSERT INTO room_messages (room_id, username, text, type) VALUES (?, 'System', ?, 'system')`, [room_id, `Pembuat Room (${username}) telah keluar. Ruangan ditutup.`]);
        } else {
          await pool.query(`UPDATE room_participants SET status = 'left' WHERE session_token = ?`, [token]);
          await pool.query(`INSERT INTO room_messages (room_id, username, text, type) VALUES (?, 'System', ?, 'system')`, [room_id, `${username} telah meninggalkan ruangan.`]);
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === "close_room") {
      const token = formData.get("token") as string;
      const [userRows]: any = await pool.query(`SELECT room_id FROM room_participants WHERE session_token = ?`, [token]);
      if (userRows.length > 0) {
        const roomId = userRows[0].room_id;
        const [ownerRows]: any = await pool.query(`SELECT session_token FROM room_participants WHERE room_id = ? ORDER BY id ASC LIMIT 1`, [roomId]);
        if (ownerRows.length > 0 && ownerRows[0].session_token === token) {
          await pool.query(`UPDATE rooms SET expires_at = CURRENT_TIMESTAMP WHERE id = ?`, [roomId]);
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Invalid POST Action" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}