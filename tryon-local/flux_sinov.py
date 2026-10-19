"""
FLUX 3 Image Klein sinovi (rasmli rejim uchun): hozirgi CatVTON bilan bir xil rasmlarda yonma-yon solishtirish.

Alohida muhitda ishlaydi (.venv-flux, setup_flux.bat): FLUX 3 uchun diffusers'ning yangi (dev) versiyasi va torch 2.6+
kerak, asosiy server muhiti (.venv, torch 2.4, diffusers 0.31) o'zgarmaydi. Sayt va server hozircha FLUX'ni ishlatmaydi.

6 GB GPU uchun sozlangan (rasmiy minimal talab 8 GB):
  - step-distilled model (black-forest-labs/flux-3-image-klein): 4-16 qadam, classifier-free guidance yo'q;
  - transformer NVFP4 (4 bit, ~3 GB): 30-seriya GPU'da har qatlam ishlatilganda bf16 ga ochiladi (tezlashmaydi,
    lekin xotiraga sig'adi; tez yadrolar faqat RTX 50 da);
  - matn kodlovchi (Qwen3-VL 4B) har ko'rsatma uchun bir marta CPU'da ishlaydi, natijasi models/flux3_kesh da;
  - prompt upsampler (9B) ishlatilmaydi: ko'rsatma kiyim turiga qarab qolip bilan yoziladi.

flux_sinov.bat: (1) server ishlab tursa CatVTON natijalari olinadi, (2) server to'xtatiladi, (3) FLUX 3 ishlaydi.
Natija: runs/flux3/taqqoslash.jpg (har qator: odam | kiyim | CatVTON | FLUX 3 | Gemini namunasi) va natija.txt.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
REPO = "black-forest-labs/flux-3-image-klein"
CACHE_DIR = ROOT / "models" / "flux3_kesh"
OUT_DIR = ROOT / "runs" / "flux3"
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp")
TILE_H = 480
DEVICE = "cuda"

# Fayl nomi boshidan kiyim turi (katalog: ft-01, ky-03 ...) va ko'rsatmadagi inglizcha nomi
KIND_BY_PREFIX = {
    "ft": "futbolka", "ky": "ko'ylak", "sv": "sviter", "kt": "kurtka",
    "ks": "kostyum", "lb": "libos", "sh": "shim", "yb": "yubka",
}
ENGLISH = {
    "futbolka": "t-shirt", "ko'ylak": "shirt", "sviter": "sweater", "kurtka": "jacket",
    "kostyum": "suit", "libos": "dress", "shim": "trousers", "yubka": "skirt",
}
KEEP = ("Keep the person's face, identity, hairstyle, skin, hands, body shape and pose, the background, the lighting "
        "and the camera framing exactly unchanged.")


def kind_of(stem: str) -> str:
    return KIND_BY_PREFIX.get(stem.split("-")[0].lower(), "futbolka")


def category_of(kind: str) -> str:
    """Server /tryon kategoriyasi (sayt bilan bir xil)"""
    return "one-pieces" if kind == "libos" else "bottoms" if kind in ("shim", "yubka") else "tops"


def instruction(kind: str) -> str:
    """
    Tahrir ko'rsatmasi: FLUX 3 prompt upsamplerining "i2i" uslubida (buyruq shaklida, rasmlar tartib raqami bilan,
    oxirida nima o'zgarmasligi). Upsampler 9B va 6 GB ga sig'maydi, shuning uchun qolip
    """
    name = ENGLISH.get(kind, "garment")
    fidelity = (f"The new {name} keeps the exact color, fabric texture, pattern, print, collar, buttons, seams and "
                f"length of the {name} in the second image and fits this person's body naturally at a realistic "
                "size, with soft folds and shading that match the lighting of the first image.")
    if kind == "libos":
        return (f"Dress the person in the first image in the {name} shown in the second image, replacing all the "
                f"clothing they are wearing. {fidelity} {KEEP}")
    if kind in ("shim", "yubka"):
        return (f"Replace the trousers worn by the person in the first image with the {name} shown in the second "
                f"image. {fidelity} Keep the upper-body garment and shoes unchanged. {KEEP}")
    worn = " It is worn fully closed, so the clothing underneath is not visible." if kind in ("kurtka", "kostyum") else ""
    return (f"Replace the upper-body garment worn by the person in the first image with the {name} shown in the "
            f"second image.{worn} {fidelity} Keep the trousers and shoes unchanged. {KEEP}")


def find_image(folder: Path, stem: str) -> Path | None:
    for ext in IMAGE_EXT:
        if (folder / f"{stem}{ext}").exists():
            return folder / f"{stem}{ext}"
    return None


def dataset_pairs(ds: Path, people: list[str], per_person: int) -> list[dict]:
    """O'qitish to'plamidan juftliklar: odamning asosiy surati + kiyim; Gemini'da yasalgan namunasi bo'lsa ular avval"""
    garments_dir = ds / "kiyimlar"
    garments = sorted({f.stem[:-4] for f in garments_dir.glob("*_old.*") if f.suffix.lower() in IMAGE_EXT})
    if not people:
        people = sorted(d.name for d in (ds / "old").iterdir() if d.is_dir()) if (ds / "old").exists() else []
        people = [p for p in ("o01", "o06", "o10") if p in people] or people[:3]
    pairs = []
    for person in people:
        pdir = ds / "old" / person
        base = find_image(pdir, "asosiy")
        if base is None:
            print(f"  {person}: asosiy surat yo'q, o'tkazib yuborildi")
            continue
        with_target = [g for g in garments if find_image(pdir, g)]
        chosen = (with_target + [g for g in garments if g not in with_target])[:per_person]
        for g in chosen:
            pairs.append({
                "name": f"{person}_{g}",
                "person": base,
                "garment": find_image(garments_dir, f"{g}_old"),
                "target": find_image(pdir, g),
                "kind": kind_of(g),
            })
    return pairs


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def catvton_phase(pairs: list[dict], url: str) -> None:
    """Ishlab turgan lokal serverdan (CatVTON) xuddi shu juftliklar uchun natija: runs/flux3/catvton/<nom>.jpg"""
    try:
        with urllib.request.urlopen(f"{url}/health", timeout=5) as r:
            health = json.loads(r.read())
    except (urllib.error.URLError, OSError):
        print("CatVTON server ishlamayapti: solishtirishda CatVTON ustuni bo'sh qoladi (start.bat bilan yoqsa bo'ladi)")
        return
    if health.get("status") != "ready" or health.get("device") == "mock":
        print(f"CatVTON server tayyor emas ({health.get('status')}, {health.get('device')}): o'tkazib yuborildi")
        return
    out = OUT_DIR / "catvton"
    out.mkdir(parents=True, exist_ok=True)
    for p in pairs:
        body = json.dumps({"person": b64(p["person"]), "garment": b64(p["garment"]),
                           "category": category_of(p["kind"]), "kind": p["kind"]}).encode()
        req = urllib.request.Request(f"{url}/tryon", data=body, headers={"Content-Type": "application/json"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as e:
            print(f"  CatVTON {p['name']}: xato {e.code} {e.read()[:200]!r}")
            continue
        (out / f"{p['name']}.jpg").write_bytes(base64.b64decode(data["image"]))
        print(f"  CatVTON {p['name']}: {time.time() - t0:.1f} s", flush=True)


def target_size(person: Image.Image, megapixels: float) -> tuple[int, int]:
    """Odam surati nisbatida, ~megapixels maydon, tomonlari 16 ga karrali"""
    aspect = person.width / person.height
    h = (megapixels * 1e6 / aspect) ** 0.5
    w = h * aspect
    return max(256, round(w / 16) * 16), max(256, round(h / 16) * 16)


def fit_garment(garment: Image.Image, max_side: int) -> Image.Image:
    g = garment.convert("RGB")
    g.thumbnail((max_side, max_side), Image.LANCZOS)
    return g


def encode_prompts(prompts: list[str], te_mode: str) -> dict[str, "object"]:
    """Har ko'rsatma uchun matn embeddinglari (models/flux3_kesh da saqlanadi, keyingi safar kodlovchi yuklanmaydi)"""
    import torch

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    result, missing = {}, []
    for prompt in prompts:
        f = CACHE_DIR / f"{hashlib.sha1(prompt.encode()).hexdigest()[:16]}.pt"
        if f.exists():
            result[prompt] = torch.load(f)
        else:
            missing.append((prompt, f))
    if not missing:
        return result

    from diffusers.modular_pipelines.flux3.encoders import Flux3TextEncoderStep
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

    print(f"Matn kodlovchi (Qwen3-VL 4B, {te_mode}) yuklanmoqda: {len(missing)} ta ko'rsatma...", flush=True)
    tokenizer = AutoProcessor.from_pretrained(REPO, subfolder="tokenizer")
    if te_mode == "gpu4bit":
        from transformers import BitsAndBytesConfig

        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16)
        text_encoder = Qwen3VLForConditionalGeneration.from_pretrained(
            REPO, subfolder="text_encoder", quantization_config=quant, device_map="cuda", dtype=torch.bfloat16)
        device = torch.device("cuda")
    else:
        text_encoder = Qwen3VLForConditionalGeneration.from_pretrained(REPO, subfolder="text_encoder", dtype=torch.bfloat16)
        device = torch.device("cpu")
    text_encoder.eval()
    with torch.no_grad():
        for prompt, f in missing:
            t0 = time.time()
            embeds = Flux3TextEncoderStep._get_qwen3_vl_prompt_embeds(
                text_encoder=text_encoder, tokenizer=tokenizer, prompt=prompt, device=device)
            embeds = embeds.to("cpu", torch.bfloat16)
            torch.save(embeds, f)
            result[prompt] = embeds
            print(f"  ko'rsatma kodlandi ({time.time() - t0:.0f} s)", flush=True)
    del text_encoder
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return result


def load_pipeline(variant: str, gguf: str | None, offload: bool, reserve_gb: float = 2.0):
    """
    Step-distilled FLUX 3 Image Klein: matn qismlarisiz (embeddinglar tayyor beriladi), VAE fp32 va bo'laklab
    (tiling) dekodlanadi. Standart: hammasi GPU'da (~4-4.5 GB). offload: komponentlar navbat bilan GPU'ga chiqadi
    (transformer va VAE bir vaqtda turmaydi), xotira yetmasa
    """
    import torch
    from diffusers import Flux3Transformer2DModel
    from diffusers.modular_pipelines import Flux3DistilledAutoBlocks

    print(f"Transformer yuklanmoqda ({'GGUF' if gguf else variant})...", flush=True)
    if gguf:
        from diffusers import GGUFQuantizationConfig

        transformer = Flux3Transformer2DModel.from_single_file(
            gguf, config=REPO, subfolder="transformer",
            quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16), dtype=torch.bfloat16)
    elif variant == "bf16":
        transformer = Flux3Transformer2DModel.from_pretrained(REPO, subfolder="transformer", dtype=torch.bfloat16)
    else:
        from diffusers import BFLQuantizationConfig

        transformer = Flux3Transformer2DModel.from_single_file(
            f"https://huggingface.co/{REPO}/blob/main/variants/{variant}/model.safetensors",
            config=REPO, subfolder="transformer",
            quantization_config=BFLQuantizationConfig(compute_dtype=torch.bfloat16), dtype=torch.bfloat16)

    blocks = Flux3DistilledAutoBlocks()
    blocks.sub_blocks.pop("prompt_upsampler")
    blocks.sub_blocks.pop("text_encoder")
    manager = None
    if offload:
        from diffusers import ComponentsManager

        manager = ComponentsManager()
    pipe = blocks.init_pipeline(REPO, components_manager=manager)
    pipe.load_components(names=["vae", "scheduler"], dtype={"vae": torch.float32, "default": torch.bfloat16})
    pipe.update_components(transformer=transformer)
    if hasattr(pipe.vae, "enable_tiling"):
        pipe.vae.enable_tiling()  # dekodlash xotirasi cho'qqisi pasayadi (natija deyarli bir xil)
    if manager is not None:
        # from_single_file bilan yuklangan transformer menejerga o'zi qo'shilmaydi: qo'lda qo'shiladi
        if not any(c is transformer for c in manager.components.values()):
            manager.add("transformer", transformer)
        manager.enable_auto_cpu_offload(device=DEVICE, memory_reserve_margin=f"{reserve_gb}GB")
    else:
        pipe.to(DEVICE)
    return pipe


def generate(pipe, embeds, person: Image.Image, garment: Image.Image, size: tuple[int, int], steps: int, seed: int):
    import torch

    w, h = size
    out = pipe(
        prompt_embeds=embeds.to(DEVICE),
        image=[person.convert("RGB").resize((w, h), Image.LANCZOS), garment],
        height=h,
        width=w,
        num_inference_steps=steps,
        generator=torch.Generator().manual_seed(seed),
        output="images",
    )
    return out[0]


def flux_phase(pairs: list[dict], args) -> list[str]:
    import torch

    if not torch.cuda.is_available():
        print("XATO: CUDA GPU topilmadi (.venv-flux da torch CUDA bilan o'rnatilganini tekshiring)")
        sys.exit(1)
    prompts = sorted({instruction(p["kind"]) for p in pairs})
    embeds = encode_prompts(prompts, args.te)
    try:
        pipe = load_pipeline(args.variant, args.gguf, args.offload)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "401" in msg or "gated" in msg.lower() or "403" in msg:
            print("XATO: modelga ruxsat yo'q. https://huggingface.co/black-forest-labs/flux-3-image-klein sahifasida "
                  "litsenziyani qabul qiling, keyin: .venv-flux\\Scripts\\hf auth login")
            sys.exit(2)
        raise
    out = OUT_DIR / "flux"
    out.mkdir(parents=True, exist_ok=True)
    log = []
    for p in pairs:
        person = Image.open(p["person"]).convert("RGB")
        garment = fit_garment(Image.open(p["garment"]), args.kiyim_px)
        size = target_size(person, args.mp)
        torch.cuda.reset_peak_memory_stats()
        t0 = time.time()
        try:
            image = generate(pipe, embeds[instruction(p["kind"])], person, garment, size, args.qadam, args.seed)
        except torch.OutOfMemoryError:
            print(f"  {p['name']}: GPU xotirasi yetmadi. Urinib ko'ring: --offload yoki kichikroq o'lcham --mp 0.35")
            torch.cuda.empty_cache()
            continue
        seconds = time.time() - t0
        peak = torch.cuda.max_memory_allocated() / 2**30
        image.save(out / f"{p['name']}.jpg", quality=92)
        line = f"{p['name']}: {seconds:.1f} s, {size[0]}x{size[1]}, {args.qadam} qadam, GPU cho'qqisi {peak:.1f} GB"
        print("  FLUX 3 " + line, flush=True)
        log.append(line)
    return log


def tile(path: Path | None, label: str) -> Image.Image:
    if path is not None and path.exists():
        img = Image.open(path).convert("RGB")
        img = img.resize((max(1, round(img.width * TILE_H / img.height)), TILE_H), Image.LANCZOS)
    else:
        img = Image.new("RGB", (TILE_H * 2 // 3, TILE_H), (225, 220, 214))
        label += " (yo'q)"
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, img.width, 24), fill=(43, 22, 56))
    draw.text((8, 6), label, fill=(255, 255, 255))
    return img


def compose_grid(pairs: list[dict]) -> Path | None:
    rows = []
    for p in pairs:
        tiles = [
            tile(p["person"], f"{p['name'].split('_')[0]}: asosiy"),
            tile(p["garment"], p["name"].split("_", 1)[1]),
            tile(OUT_DIR / "catvton" / f"{p['name']}.jpg", "CatVTON (hozirgi)"),
            tile(OUT_DIR / "flux" / f"{p['name']}.jpg", "FLUX 3 Klein"),
            tile(p["target"], "Gemini namunasi"),
        ]
        row = Image.new("RGB", (sum(t.width for t in tiles) + 8 * (len(tiles) - 1), TILE_H), (255, 255, 255))
        x = 0
        for t in tiles:
            row.paste(t, (x, 0))
            x += t.width + 8
        rows.append(row)
    if not rows:
        return None
    sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows) + 8 * (len(rows) - 1)), (255, 255, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    path = OUT_DIR / "taqqoslash.jpg"
    sheet.save(path, quality=88)
    return path


def main() -> int:
    p = argparse.ArgumentParser(description="FLUX 3 Image Klein va CatVTON'ni bir xil rasmlarda solishtirish")
    p.add_argument("--bosqich", choices=["catvton", "flux", "hammasi"], default="hammasi")
    p.add_argument("--dataset", default=str(ROOT / "dataset"))
    p.add_argument("--odamlar", default="", help="Masalan o01,o06,o10 (standart: shular, bo'lmasa birinchi 3 odam)")
    p.add_argument("--har-odam", type=int, default=3, help="Har odamga nechta kiyim")
    p.add_argument("--rasm", default=None, help="O'z suratingiz (to'plam o'rniga bitta juftlik)")
    p.add_argument("--kiyim-fayl", default=None, help="--rasm bilan: kiyim rasmi")
    p.add_argument("--qadam", type=int, default=12, help="Diffuziya qadamlari (model 4-16 ga o'qitilgan)")
    p.add_argument("--mp", type=float, default=0.5, help="Natija maydoni, megapiksel (0.5 = ~576x864)")
    p.add_argument("--kiyim-px", type=int, default=640, help="Kiyim rasmining eng katta tomoni")
    p.add_argument("--variant", choices=["nvfp4", "fp8r", "bf16"], default="nvfp4")
    p.add_argument("--gguf", default=None, help="GGUF transformer fayli yoki havolasi (--variant o'rniga)")
    p.add_argument("--te", choices=["cpu", "gpu4bit"], default="cpu", help="Matn kodlovchi qayerda ishlaydi")
    p.add_argument("--offload", action="store_true",
                   help="Komponentlar navbat bilan GPU'ga chiqadi (xotira yetmasa; har rasmda 1-3 s sekinroq)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--catvton-url", default="http://127.0.0.1:8001")
    args = p.parse_args()

    if args.rasm:
        if not args.kiyim_fayl:
            print("XATO: --rasm bilan --kiyim-fayl ham kerak")
            return 1
        g = Path(args.kiyim_fayl)
        stem = g.stem[:-4] if g.stem.endswith("_old") else g.stem
        pairs = [{"name": f"sinov_{stem}", "person": Path(args.rasm), "garment": g, "target": None, "kind": kind_of(stem)}]
    else:
        people = [x.strip() for x in args.odamlar.split(",") if x.strip()]
        pairs = dataset_pairs(Path(args.dataset), people, args.har_odam)
    if not pairs:
        print("XATO: juftlik topilmadi (dataset/old/oXX/asosiy.jpg va dataset/kiyimlar/<kiyim>_old.jpg kerak)")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"{len(pairs)} ta juftlik: {', '.join(x['name'] for x in pairs)}")

    if args.bosqich in ("catvton", "hammasi"):
        catvton_phase(pairs, args.catvton_url)
    if args.bosqich in ("flux", "hammasi"):
        log = flux_phase(pairs, args)
        (OUT_DIR / "natija.txt").write_text("\n".join(log) + "\n", encoding="utf-8")
    sheet = compose_grid(pairs)
    if sheet:
        print(f"Solishtirish: {sheet}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
