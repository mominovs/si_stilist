# Codex / ChatGPT uchun vazifa: jonli oyna o'qitish rasmlari

Foydalanuvchi uchun: Codex'da loyiha papkasini ulang va shu xabarni yuboring:
"tryon-local/CODEX_VAZIFA.md dagi vazifani bajar, 20 ta rasm". Codex quyidagi inglizcha ko'rsatmaga amal qiladi.

---

## Task (for the agent)

You generate training images for a virtual try-on model. You only create image files in the folders listed
by the queue. Do not edit any code, do not delete or rename existing files, do not touch anything outside
`tryon-local/dataset/`.

### Steps

1. In `tryon-local`, create the queue. Windows: `generate.bat navbat --soni 20`. Bash/PowerShell without .bat:
   `.venv\Scripts\python.exe generate_dataset.py navbat --soni 20` (Windows venv). It writes
   `dataset/_navbat.json` (machine-readable) and `dataset/_navbat.md` (same, for people).
2. For every task in `dataset/_navbat.json`, in order:
   - `"tur": "odam"`: generate ONE photo from `prompt` with your image generation tool, no other input.
   - `"tur": "kiyim"`: generate ONE image by editing, with the files in `biriktirish` as input images in that
     exact order (first = the person photo to edit, second = the garment), using `prompt` exactly as written.
   - Save the result exactly at `saqlash` (path relative to `tryon-local/`), as JPEG or PNG. Same file name;
     the folder already exists or create it.
   - Each task is independent: do not reuse a previous generated image as input, and never edit the same
     image twice in a row (faces drift).
3. Check each result before saving. Regenerate once if any of these is wrong; if still wrong, skip the task
   (do not save anything for it):
   - person photo: one real-looking person, both shoulders and arms fully in frame, torso not covered,
     no text, no mirror selfie, no phone covering the body;
   - garment edit: same face, hair, pose, trousers, background and framing as the first input; the new
     top matches the garment image (color, collar, sleeves, print).
4. When the queue is done, run `generate.bat yopishtir` (aligns each edited image to its base photo and keeps
   only the upper-body area, so face and background stay pixel-identical), then `prep.bat`.
5. If the queue contained new people (`asosiy.jpg`), run step 1 again: the next queue will dress them.
   Stop after the number of images the user asked for.
6. Report: how many images were saved, how many were skipped and why, and the last line of `prep.bat`
   ("Juftliklar: yaxshi N, o'rtacha N, yaroqsiz N").

### Rules

- Never upload or reference real people other than the files given in `biriktirish`.
- Keep the prompt text unchanged; do not add styles, filters, logos or text.
- If your environment has no image generation tool, stop and say so; do not draw images with code.
