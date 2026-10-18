"""
Rasmli rejim modelini (CatVTON, niqobli) o'z suratlaringiz va kiyimlaringiz bilan qo'shimcha o'qitish (train_photo.bat).

Jonli oyna bilan bir xil to'plam ishlatiladi: avval prep.bat (dataset_prep.py) -> dataset/_tayyor/pairs.json.
Har juftlik (kirish A -> maqsad B, kiyim B) dan: maqsad surat B, kiyim joyi bo'yalgan (A va B niqoblari birlashmasi,
model kiyim shaklini niqobdan "o'g'irlamasin"), kiyim B rasmi -> model B ni qayta chizishni o'rganadi. Bu serverdagi
kiyintirish bilan aynan bir xil vazifa: kiyim joyi bo'yalgan surat + kiyim rasmi -> kiyintirilgan surat.

Faqat CatVTON o'qitadigan qism (UNet'ning self-attention qatlamlari, ~50 mln parametr) o'zgaradi, qolgan model muzlatilgan.
6 GB GPU uchun: UNet bf16, o'qitiladigan qatlamlar fp32 (autocast), gradient checkpointing, latentlar oldindan
hisoblanadi (VAE o'qitish paytida GPU'da turmaydi). Standart o'lcham 512x384; xotira yetsa --height 768 --width 576.

Natija: models/catvton_ft/mix-48k-1024/attention/model.safetensors. Server (niqobli rejim) shu fayl bo'lsa uni asl
og'irliklar o'rniga yuklaydi (/health: photo_model). Yoqmasa, models/catvton_ft papkasini o'chiring.
Kamida 3 odam bo'lsa oxirgisi tekshiruvga ajratiladi va model faqat tekshiruvda yaxshilansa saqlanadi. Odam kam bo'lsa
natija models/catvton_ft_sinov ga yoziladi (server uni o'zi yuklamaydi): namunalarni ko'rib, yoqsa catvton_ft deb
qayta nomlang.

Misol: train_photo.bat --steps 1500
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
CATVTON_DIR = ROOT / "CatVTON"
MODELS_DIR = ROOT / "models"
BASE_MODEL = "booksforcharlie/stable-diffusion-inpainting"
BASE_WEIGHTS = "zhengchong/CatVTON"
VAE_MODEL = "stabilityai/sd-vae-ft-mse"
# CatVTONPipeline.auto_attn_ckpt_load(version="mix") shu papka nomini kutadi: server o'qitilgan nusxani ham shunday yuklaydi
SUB_FOLDER = "mix-48k-1024"
FT_DIR = MODELS_DIR / "catvton_ft"
TRIAL_DIR = MODELS_DIR / "catvton_ft_sinov"
# Kiyim rasmi qaysi ko'rinishda: rasmli rejim old va orqa suratlar bilan ishlaydi (yon tomon faqat jonli oyna uchun)
GARMENT_SUFFIX = {"old": "old", "orqa": "orqa"}
# Odam atrofidagi zaxira (kesim serverdagidek 3:4)
CROP_MARGIN = 0.05
# Tekshiruv yo'qotishi: shu vaqt qadamlari va bir xil shovqin bilan (natijalar solishtirilsin)
VAL_TIMESTEPS = (100, 300, 500, 700, 900)


def keep_awake() -> None:
    """Windows: o'qitish davomida kompyuter uyquga ketmasin (jarayon tugashi bilan o'zi bekor bo'ladi)"""
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED


def attention_file(folder: Path) -> Path:
    return folder / SUB_FOLDER / "attention" / "model.safetensors"


def open_garment(garments_dir: Path, name: str) -> Image.Image | None:
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if (garments_dir / f"{name}{ext}").exists():
            return Image.open(garments_dir / f"{name}{ext}").convert("RGB")
    return None


def person_box(bg: np.ndarray, aspect: float) -> tuple[int, int, int, int]:
    """Odam chegarasi (fon niqobi teskarisi) atrofida aspect (w/h) nisbatli kesim, zaxira bilan; kadrdan chiqishi mumkin"""
    h, w = bg.shape
    ys, xs = np.nonzero(~bg)
    if len(xs) == 0:
        x0, y0, x1, y1 = 0, 0, w, h
    else:
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bw, bh = (x1 - x0) * (1 + 2 * CROP_MARGIN), (y1 - y0) * (1 + 2 * CROP_MARGIN)
    if bw / bh < aspect:
        bw = bh * aspect
    else:
        bh = bw / aspect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return int(round(cx - bw / 2)), int(round(cy - bh / 2)), int(round(cx + bw / 2)), int(round(cy + bh / 2))


def crop(arr: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """Kesim; kadrdan tashqari qism chetdan davom ettiriladi (serverdagidek: rasm chekkasida chiziq chiqmasin)"""
    x0, y0, x1, y1 = box
    h, w = arr.shape[:2]
    pad = max(0, -x0, -y0, x1 - w, y1 - h)
    if pad:
        arr = cv2.copyMakeBorder(arr, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
    return arr[y0 + pad:y1 + pad, x0 + pad:x1 + pad]


def pad_garment(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Kiyim rasmini kesmasdan oq fon bilan o'lchamga keltiradi (server resize_and_padding bilan bir xil)"""
    w, h = image.size
    tw, th = size
    if w / h < tw / th:
        nw, nh = w * th // h, th
    else:
        nw, nh = tw, h * tw // w
    image = image.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", size, (255, 255, 255))
    canvas.paste(image, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def load_example(ready: Path, garments_dir: Path, q: dict, size: tuple[int, int]) -> dict | None:
    """Juftlikdan o'qitish misoli: maqsad surat, birlashgan niqob, kiyim rasmi (hammasi size = (w, h) da)"""
    view = q["view"]
    if view not in GARMENT_SUFFIX:
        return None
    pdir = ready / view / q["person"]
    garment = open_garment(garments_dir, f"{q['garment']}_{GARMENT_SUFFIX[view]}")
    if garment is None:
        return None
    target = np.asarray(Image.open(pdir / f"{q['target']}.jpg").convert("RGB"))
    mask = (np.asarray(Image.open(pdir / f"{q['target']}_kiyim.png")) > 127) | (
        np.asarray(Image.open(pdir / f"{q['input']}_kiyim.png")) > 127)
    bg = np.asarray(Image.open(pdir / f"{q['target']}_fon.png")) > 127
    box = person_box(bg, size[0] / size[1])
    person = cv2.resize(crop(target, box), size, interpolation=cv2.INTER_AREA)
    m = cv2.resize(crop(mask.astype(np.uint8) * 255, box), size, interpolation=cv2.INTER_NEAREST) > 127
    return {
        "key": f"{view}/{q['person']}/{q['input']}->{q['target']}",
        "person_name": q["person"],
        "person": person,
        "mask": m,
        "garment": np.asarray(pad_garment(garment, size)),
    }


def to_tensor(img: np.ndarray):
    import torch

    return torch.from_numpy(img).permute(2, 0, 1).float().div(127.5).sub(1)[None]


def build_models(device: str, start_from: Path | None):
    """UNet (bf16, cross-attention o'chirilgan), o'qitiladigan attention qatlamlari, VAE va jadvallar"""
    import torch

    sys.path.insert(0, str(CATVTON_DIR))
    from accelerate import load_checkpoint_in_model
    from diffusers import AutoencoderKL, DDIMScheduler, DDPMScheduler, UNet2DConditionModel
    from huggingface_hub import snapshot_download
    from model.attn_processor import SkipAttnProcessor
    from model.utils import get_trainable_module, init_adapter

    unet = UNet2DConditionModel.from_pretrained(BASE_MODEL, subfolder="unet", torch_dtype=torch.bfloat16)
    init_adapter(unet, cross_attn_cls=SkipAttnProcessor)
    attn = get_trainable_module(unet, "attention")
    source = start_from if start_from is not None else Path(snapshot_download(repo_id=BASE_WEIGHTS))
    load_checkpoint_in_model(attn, str(source / SUB_FOLDER / "attention"))
    vae = AutoencoderKL.from_pretrained(VAE_MODEL)
    train_sched = DDPMScheduler.from_pretrained(BASE_MODEL, subfolder="scheduler")
    sample_sched = DDIMScheduler.from_pretrained(BASE_MODEL, subfolder="scheduler")
    return unet.to(device), attn, vae, train_sched, sample_sched


def main() -> int:
    p = argparse.ArgumentParser(description="Rasmli rejim modelini (CatVTON) qo'shimcha o'qitish")
    p.add_argument("--dataset", default=str(ROOT / "dataset"))
    p.add_argument("--steps", type=int, default=1500)
    p.add_argument("--batch", type=int, default=1)
    p.add_argument("--accum", type=int, default=4, help="Gradient yig'ish: samarali partiya = batch x accum")
    p.add_argument("--lr", type=float, default=1e-5)
    p.add_argument("--height", type=int, default=512)
    p.add_argument("--width", type=int, default=384)
    p.add_argument("--val", default=None, help="Tekshiruv uchun ajratiladigan odam papkasi (standart: oxirgisi)")
    p.add_argument("--faqat-yaxshi", action="store_true", help="Faqat 'yaxshi' baholangan juftliklar")
    p.add_argument("--toza", action="store_true", help="Saqlangan o'qitilgan modeldan emas, asl CatVTON'dan boshlash")
    p.add_argument("--every", type=int, default=250, help="Necha qadamda tekshiruv va namuna rasm")
    p.add_argument("--sample-steps", type=int, default=20, help="Namuna rasmdagi diffuziya qadamlari")
    p.add_argument("--daqiqa", type=float, default=0,
                   help="Vaqt bo'yicha o'qitish (kechasi): shuncha daqiqa, --steps hisobga olinmaydi")
    p.add_argument("--aks-yoq", action="store_true", help="Oyna aksi bilan ko'paytirmaslik (kiyimda yozuv/logo bo'lsa)")
    args = p.parse_args()
    keep_awake()

    pairs_file = Path(args.dataset) / "_tayyor" / "pairs.json"
    if not pairs_file.exists():
        print("XATO: avval prep.bat ni ishga tushiring (dataset/_tayyor/pairs.json yo'q)")
        return 1
    if not CATVTON_DIR.exists():
        print("XATO: CatVTON papkasi yo'q. Avval setup.bat ni ishga tushiring.")
        return 1
    pairs = json.loads(pairs_file.read_text(encoding="utf-8"))
    if args.faqat_yaxshi:
        pairs = [q for q in pairs if q["grade"] == "yaxshi"]
    try:
        return train(pairs, args, build_models)
    except RuntimeError as e:  # torch.cuda.OutOfMemoryError ham RuntimeError
        if "out of memory" not in str(e).lower():
            raise
        print("XATO: GPU xotirasi yetmadi. Kichikroq o'lcham bilan qayta ishga tushiring: --height 512 --width 384")
        return 3


def train(pairs: list[dict], args, build) -> int:
    import torch
    import torch.nn.functional as F

    random.seed(0)
    torch.manual_seed(0)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("DIQQAT: GPU topilmadi, o'qitish juda sekin bo'ladi")
    else:
        torch.backends.cuda.matmul.allow_tf32 = True
    ds = Path(args.dataset)
    size = (args.width, args.height)

    examples = [e for q in pairs if (e := load_example(ds / "_tayyor", ds / "kiyimlar", q, size)) is not None]
    if not examples:
        print("XATO: yaroqli misol yo'q (old/orqa juftliklar va kiyimlar/<kiyim>_old.png kerak)")
        return 1
    people = sorted({e["person_name"] for e in examples})
    val_person = args.val or (people[-1] if len(people) >= 3 else None)
    train_set = [e for e in examples if e["person_name"] != val_person]
    val_set = [e for e in examples if e["person_name"] == val_person]
    if not train_set:
        print("XATO: tekshiruvdan tashqari o'qitish misoli qolmadi")
        return 1
    if not getattr(args, "aks_yoq", False):
        # Oyna aksi (odam, niqob va kiyim birga): ma'lumot ikki barobar. Tekshiruv odamiga qo'shilmaydi
        train_set += [dict(e, key=e["key"] + "/aks", person=np.ascontiguousarray(e["person"][:, ::-1]),
                           mask=np.ascontiguousarray(e["mask"][:, ::-1]), garment=np.ascontiguousarray(e["garment"][:, ::-1]))
                      for e in train_set]
        examples = train_set + val_set
    print(f"{len(train_set)} o'qitish, {len(val_set)} tekshiruv misoli ({len(people)} odam"
          f"{', tekshiruv: ' + val_person if val_person else ''}), {size[0]}x{size[1]}, qurilma {device}")

    start_from = None if args.toza or not attention_file(FT_DIR).exists() else FT_DIR
    print("Model yuklanmoqda" + (" (saqlangan o'qitilgan nusxadan davom etiladi, --toza: asldan)" if start_from else "") + "...")
    unet, attn, vae, train_sched, sample_sched = build(device, start_from)
    unet.requires_grad_(False)
    attn.to(torch.float32)
    attn.requires_grad_(True)
    params = [q for q in attn.parameters() if q.requires_grad]
    print(f"O'qitiladigan parametrlar: {sum(q.numel() for q in params) / 1e6:.1f} mln")
    try:
        unet.enable_gradient_checkpointing()
    except Exception:  # noqa: BLE001
        pass

    # Latentlar bir marta: VAE keyin faqat namuna rasmlar uchun GPU'ga chiqadi
    vae.to(device).eval()
    scale = vae.config.scaling_factor

    @torch.no_grad()
    def encode(img: np.ndarray):
        return (vae.encode(to_tensor(img).to(device)).latent_dist.mean * scale).cpu()

    t0 = time.time()
    for e in examples:
        m = torch.from_numpy(e["mask"].astype(np.float32))[None, None]
        target = encode(e["person"])
        e["target"] = target
        e["masked"] = encode(np.where(e["mask"][..., None], 0, e["person"]).astype(np.uint8))
        e["cond"] = encode(e["garment"])
        e["mask_lat"] = F.interpolate(m, size=target.shape[-2:], mode="nearest")
    print(f"Latentlar tayyor ({time.time() - t0:.0f} s)")
    vae.to("cpu")
    if device == "cuda":
        torch.cuda.empty_cache()

    try:
        import bitsandbytes as bnb

        opt = bnb.optim.AdamW8bit(params, lr=args.lr, weight_decay=1e-2)
    except Exception:  # noqa: BLE001
        opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=1e-2)
    autocast = torch.autocast(device_type=device, dtype=torch.bfloat16)
    num_t = train_sched.config.num_train_timesteps

    def stack(batch: list[dict], key: str):
        return torch.cat([b[key] for b in batch]).to(device)

    def model_input(xt, mask_lat, masked, cond):
        mask_cat = torch.cat([mask_lat, torch.zeros_like(mask_lat)], dim=-2)
        return torch.cat([xt, mask_cat, torch.cat([masked, cond], dim=-2)], dim=1)

    def loss_of(batch: list[dict], t, noise=None, drop=None):
        target, masked, cond, mask_lat = (stack(batch, k) for k in ("target", "masked", "cond", "mask_lat"))
        x0 = torch.cat([target, cond], dim=-2)
        noise = torch.randn_like(x0) if noise is None else noise.to(device)
        xt = train_sched.add_noise(x0, noise, t)
        if drop is not None:
            # Kiyimsiz holat (classifier-free guidance): serverdagi kabi kiyim latenti nolga almashadi
            cond = cond * (~drop).float()[:, None, None, None]
        with autocast:
            pred = unet(model_input(xt, mask_lat, masked, cond), t, encoder_hidden_states=None, return_dict=False)[0]
        h = target.shape[-2]
        err = (pred.float() - noise)[..., :h, :] ** 2
        # Faqat odam yarmi; kiyim joyi kuchliroq (u yerda o'rganiladigan narsa ko'p)
        w = 1 + 2 * mask_lat
        return (err * w).mean() / w.mean()

    val_noise = [torch.randn(1, 4, 2 * e["target"].shape[-2], e["target"].shape[-1],
                             generator=torch.Generator().manual_seed(i)) for i, e in enumerate(val_set)]

    @torch.no_grad()
    def evaluate() -> float:
        if not val_set:
            return float("nan")
        total = 0.0
        for e, n in zip(val_set, val_noise):
            for tv in VAL_TIMESTEPS:
                total += float(loss_of([e], torch.tensor([tv], device=device), noise=n))
        return total / (len(val_set) * len(VAL_TIMESTEPS))

    @torch.no_grad()
    def sample(e: dict) -> np.ndarray:
        masked, cond, mask_lat = (e[k].to(device) for k in ("masked", "cond", "mask_lat"))
        cond_cat = torch.cat([masked, cond], dim=-2)
        uncond_cat = torch.cat([masked, torch.zeros_like(cond)], dim=-2)
        mask_cat = torch.cat([mask_lat, torch.zeros_like(mask_lat)], dim=-2)
        gen = torch.Generator().manual_seed(0)
        lat = torch.randn(cond_cat.shape, generator=gen).to(device) * sample_sched.init_noise_sigma
        sample_sched.set_timesteps(args.sample_steps, device=device)
        for t in sample_sched.timesteps:
            x = sample_sched.scale_model_input(torch.cat([lat] * 2), t)
            inp = torch.cat([x, torch.cat([mask_cat] * 2), torch.cat([uncond_cat, cond_cat])], dim=1)
            with autocast:
                eps = unet(inp, t, encoder_hidden_states=None, return_dict=False)[0].float()
            eu, ec = eps.chunk(2)
            lat = sample_sched.step(eu + 2.5 * (ec - eu), t, lat).prev_sample
        lat = lat[..., : e["target"].shape[-2], :].cpu() / scale
        img = vae.decode(lat).sample[0].clamp(-1, 1)
        return ((img.permute(1, 2, 0).numpy() + 1) * 127.5).astype(np.uint8)

    runs = ROOT / "runs" / "photo"
    runs.mkdir(parents=True, exist_ok=True)
    shown = (val_set or train_set)[:3]

    def preview(path: Path) -> None:
        """Har qator: kiyim joyi bo'yalgan kirish | kiyim | natija | maqsad"""
        unet.eval()
        rows = []
        for e in shown:
            masked_img = np.where(e["mask"][..., None], 128, e["person"]).astype(np.uint8)
            rows.append(np.hstack([masked_img, e["garment"], sample(e), e["person"]]))
        unet.train()
        Image.fromarray(np.vstack(rows)).save(path, quality=90)

    def save(folder: Path) -> None:
        # attn ro'yxatida attn1 modullari va ularning ichki qatlamlari bor (bir xil og'irlik bir necha nomda):
        # save_model takrorlarni bitta nomga yig'adi, load_checkpoint_in_model ularni qayta bog'laydi
        from safetensors.torch import save_model

        out = attention_file(folder)
        out.parent.mkdir(parents=True, exist_ok=True)
        save_model(attn, str(out), metadata={"format": "pt"})  # accelerate shu belgisiz faylni o'qimaydi

    unet.train()
    start_val = evaluate()
    best = start_val
    if val_set:
        print(f"Boshlang'ich model, tekshiruv yo'qotishi: {start_val:.5f} (kichikroq = yaxshiroq)")
    preview(runs / "qadam_00000.jpg")
    # Vaqt bo'yicha (kechasi) yoki qadam bo'yicha. LR: 100 qadam isinish, keyin kosinus bilan 10% gacha pasayadi
    budget = getattr(args, "daqiqa", 0) * 60
    warmup = 100

    def lr_at(step: int, elapsed: float) -> float:
        frac = min(1.0, elapsed / budget if budget else step / args.steps)
        return args.lr * min(1.0, step / warmup) * (0.1 + 0.45 * (1 + math.cos(math.pi * frac)))

    t0 = time.time()
    step = 0
    while True:
        step += 1
        elapsed = time.time() - t0
        last = elapsed >= budget if budget else step >= args.steps
        for group in opt.param_groups:
            group["lr"] = lr_at(step, elapsed)
        opt.zero_grad(set_to_none=True)
        running = 0.0
        for _ in range(args.accum):
            batch = random.sample(train_set, min(args.batch, len(train_set)))
            t = torch.randint(0, num_t, (len(batch),), device=device)
            drop = torch.rand(len(batch), device=device) < 0.1
            loss = loss_of(batch, t, drop=drop) / args.accum
            loss.backward()
            running += float(loss)
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step()
        if step % 20 == 0:
            left = f"{max(0, budget - elapsed) / 60:.0f} daqiqa qoldi" if budget else f"{step}/{args.steps}"
            print(f"qadam {step} ({left})  yo'qotish {running:.5f}  lr {lr_at(step, elapsed):.1e}  "
                  f"({(time.time() - t0) / step:.2f} s/qadam)", flush=True)
        if step % args.every == 0 or last:
            preview(runs / f"qadam_{step:05d}.jpg")
            v = evaluate()
            if val_set and v < best:
                best = v
                save(FT_DIR)
                print(f"  tekshiruv {v:.5f}: yaxshilandi, saqlandi -> models/catvton_ft", flush=True)
            elif val_set:
                print(f"  tekshiruv {v:.5f} (eng yaxshisi {best:.5f})", flush=True)
        if last:
            break
    if not val_set:
        save(TRIAL_DIR)
        print("Tekshiruv odami yo'q (kamida 3 odam kerak): natija models/catvton_ft_sinov ga saqlandi, server uni o'zi "
              "yuklamaydi. runs/photo dagi rasmlar yoqsa, papkani catvton_ft deb qayta nomlang.")
    elif best >= start_val:
        print("Model tekshiruvda yaxshilanmadi: saqlanmadi (ko'proq yoki sifatliroq ma'lumot kerak)")
    else:
        print("Ishlatish uchun: stop.bat va start.bat (server models/catvton_ft ni o'zi yuklaydi)")
    print(f"Namuna rasmlar: {runs}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
