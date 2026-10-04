"""
Extract character animation frames from the source MP4 into WebP frames
for the canvas-driven hero loop.

Usage:
    python tools/extract_frames.py

Reads  : public/character.mp4
Writes : public/frames/frame_000.webp ... (one per source frame)
"""
import os
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO = os.path.join(ROOT, "public", "character.mp4")
OUT = os.path.join(ROOT, "public", "frames")

OUT_SIZE = 420         # square output side (center-cropped from source)
QUALITY = 80           # WebP quality
STEP = 2               # keep every Nth source frame (2 -> ~12 fps effective)

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".webp"):
            os.remove(os.path.join(OUT, f))

    cap = cv2.VideoCapture(VIDEO)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {VIDEO}")

    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    side = min(src_w, src_h)
    x0 = (src_w - side) // 2
    y0 = (src_h - side) // 2
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)

    written, i = 0, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % STEP == 0:
            crop = frame[y0:y0 + side, x0:x0 + side]
            small = cv2.resize(crop, (OUT_SIZE, OUT_SIZE), interpolation=cv2.INTER_AREA)
            path = os.path.join(OUT, f"frame_{written:03d}.webp")
            cv2.imwrite(path, small, [cv2.IMWRITE_WEBP_QUALITY, QUALITY])
            written += 1
        i += 1
    cap.release()

    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"source: {src_w}x{src_h} @ {fps:.2f}fps, {total} frames")
    print(f"wrote : {written} webp frames @ {OUT_SIZE}x{OUT_SIZE} square (step {STEP})")
    print(f"size  : {size/1024/1024:.2f} MB")

if __name__ == "__main__":
    main()
