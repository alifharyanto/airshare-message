import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const text = formData.get("text") as string;
    const file = formData.get("file") as File | null;

    let fileUrl = "";
    let fileName = "";
    let fileType = "";

    // Jika ada file yang dikirim, simpan secara lokal di folder public/uploads
    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const uploadDir = join(process.cwd(), "public", "uploads");
      
      // Pastikan direktori uploads tersedia
      try {
        await mkdir(uploadDir, { recursive: true });
      } catch (dirError) {
        // Abaikan error jika direktori sudah ada
      }

      // Gunakan timestamp untuk memastikan nama file unik dan tidak tertimpa
      const uniqueName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      const path = join(uploadDir, uniqueName);
      
      await writeFile(path, buffer);
      
      // Set metadata file untuk response client
      fileUrl = `/uploads/${uniqueName}`;
      fileName = file.name;
      fileType = file.type.startsWith("image/") ? "image" : "file";
    }

    // Susun objek pesan baru
    const newMessage = {
      id: Date.now().toString(),
      text: text || "",
      sender: "me",
      fileUrl,
      fileName,
      fileType,
    };

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Terjadi error saat upload:", error);
    return NextResponse.json(
      { success: false, error: "Gagal memproses pesan" },
      { status: 500 }
    );
  }
}