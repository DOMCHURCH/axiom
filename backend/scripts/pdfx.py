"""Extract PDF text to a UTF-8 file. Usage: pdfx.py <path> <out> [start] [end]"""
import sys

from pypdf import PdfReader

path, out = sys.argv[1], sys.argv[2]
start = int(sys.argv[3]) if len(sys.argv) > 3 else 1
end = int(sys.argv[4]) if len(sys.argv) > 4 else None

reader = PdfReader(path)
total = len(reader.pages)
end = min(end or total, total)
with open(out, "w", encoding="utf-8") as f:
    f.write(f"PAGES_TOTAL {total} | RANGE {start}-{end}\n")
    for i in range(start - 1, end):
        f.write(f"\n----- PAGE {i + 1} -----\n")
        f.write((reader.pages[i].extract_text() or "").strip() + "\n")
print(f"wrote {out}  (total pages {total})")
