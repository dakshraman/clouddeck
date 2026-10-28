"use client";

import {
  Film,
  File as FileIcon,
  FileArchive,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Music,
} from "lucide-react";

/** File-type glyph: extension-mapped icon + tint, used by both list and grid views. */
export function FileGlyph({ name, size = 15 }: { name: string; size?: number }) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";

  if (["js", "mjs", "cjs", "ts", "tsx", "jsx", "php", "py", "go", "rb", "rs", "java", "c", "cpp", "h", "cs", "html", "htm", "css", "scss", "json", "yml", "yaml", "xml", "sh", "bash", "sql", "toml", "ini", "env"].includes(ext)) {
    return <FileCode2 size={size} className="shrink-0 text-sky-400" aria-hidden="true" />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"].includes(ext)) {
    return <ImageIcon size={size} className="shrink-0 text-emerald-400" aria-hidden="true" />;
  }
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"].includes(ext)) {
    return <FileArchive size={size} className="shrink-0 text-amber-400" aria-hidden="true" />;
  }
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
    return <Music size={size} className="shrink-0 text-purple-400" aria-hidden="true" />;
  }
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) {
    return <Film size={size} className="shrink-0 text-pink-400" aria-hidden="true" />;
  }
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "log", "csv"].includes(ext)) {
    return <FileText size={size} className="shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  return <FileIcon size={size} className="shrink-0 text-muted-foreground" aria-hidden="true" />;
}