import os
import sys

import fitz  # PyMuPDF

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "public", "how-it-works.pdf")
out_dir = r"C:\Users\Dominique"
doc = fitz.open(src)
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=130)
    p = os.path.join(out_dir, f"pdf_page_{i + 1}.png")
    pix.save(p)
    print("wrote", p)
print("pages:", doc.page_count)
