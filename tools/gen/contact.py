# /// script
# dependencies = ["pillow"]
# ///
"""Puts pictures side by side on one sheet, to look at a batch at a glance.

  uv run tools/gen/contact.py out.png a.png b.png ... [--across 5] [--size 300]
"""

import argparse

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("pictures", nargs="+")
ap.add_argument("--across", type=int, default=5)
ap.add_argument("--size", type=int, default=300)
args = ap.parse_args()

rows = -(-len(args.pictures) // args.across)
sheet = Image.new("RGB", (args.across * args.size, rows * args.size))
for n, path in enumerate(args.pictures):
    sheet.paste(Image.open(path).convert("RGB").resize((args.size, args.size), Image.LANCZOS), ((n % args.across) * args.size, (n // args.across) * args.size))
sheet.save(args.out)
print(args.out)
