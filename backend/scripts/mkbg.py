"""Compress the cinematic dashboard background to WebP."""
import glob
import os

from PIL import Image

# match the downloaded file even with spaces/(1) in the name
candidates = glob.glob(r"C:\Users\Dominique\Downloads\file_00000000e8e4820cbb38699460d85438*.png")
if not candidates:
    raise SystemExit("background png not found in Downloads")
src = candidates[0]
out_dir = r"C:\Users\Dominique\daddiesmoney\frontend\public\images"
os.makedirs(out_dir, exist_ok=True)

img = Image.open(src)
w, h = img.size
maxw = 1920
if w > maxw:
    img = img.resize((maxw, round(h * maxw / w)))
out = os.path.join(out_dir, "dashboard-background.webp")
img.convert("RGB").save(out, "WEBP", quality=80, method=6)
print("saved", out, img.size, f"{os.path.getsize(out)//1024} KB")
