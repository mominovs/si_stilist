"""
Jonli oyna modelini (DM-VTON) orqa yoki yon ko'rinish uchun qo'shimcha o'qitish (train.bat).

Avval: prep.bat (dataset_prep.py) -> dataset/_tayyor/pairs.json.
Har juftlik: kirish (odam A kiyimda) + kiyim B rasmi (shu ko'rinish uchun: k01_orqa.png) -> maqsad (o'sha odam,
o'sha pozada, B kiyimda). Asl DM-VTON kirishni "o'qituvchi" model bilan sun'iy yasaydi; bu yerda u tayyor
(rasm generatorida tahrirlangan), shuning uchun odam qismlari xaritasi va DensePose kerak emas.

Boshlang'ich og'irliklar: hozirgi old tomon modeli (models/dmvton). Natija alohida saqlanadi:
models/dmvton/<ko'rinish>_warp.pt va <ko'rinish>_gen.pt. Server ularni faqat shu ko'rinishda ishlatadi, old tomon
modeli o'zgarmaydi (yomon chiqsa, fayllarni o'chirish kifoya).

Misol: train.bat --view orqa --steps 3000
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from mirror import (
    SIZE,
    crop_white,
    ensure_weights,
    garment_inputs,
    load_model_modules,
    load_state,
    plain_garment,
    upper_body_box,
)

ROOT = Path(__file__).resolve().parent
KISEKLOSET_DIR = ROOT / "KiseKloset"
MODELS_DIR = ROOT / "models"


def crop_mask(mask: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """Niqob kesimi: kadrdan tashqari qism 0"""
    x0, y0, x1, y1 = box
    h, w = mask.shape
    out = np.zeros((y1 - y0, x1 - x0), dtype=mask.dtype)
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = mask[sy0:sy1, sx0:sx1]
    return out


def open_garment(garments_dir: Path, name: str) -> Image.Image | None:
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if (garments_dir / f"{name}{ext}").exists():
            return Image.open(garments_dir / f"{name}{ext}").convert("RGB")
    return None


def garment_variants(garments_dir: Path, gid: str, view: str) -> list[Image.Image]:
    """
    Jonli oyna shu ko'rinishda modelga beradigan kiyim rasmlari (o'qitish ham aynan shularni ko'rishi kerak):
     - old: old rasmi
     - orqa: do'konning orqa surati bo'lsa o'sha, bo'lmasa old rasmining naqshsiz varianti: ikkalasi aralash
     - yon: doim naqshsiz variant (jonli oyna yon surat ishlatmaydi)
    Birinchisi tekshiruvda ishlatiladi.
    """
    front = open_garment(garments_dir, f"{gid}_old")
    if view == "old":
        if front is None:
            raise FileNotFoundError(f"{gid}_old kiyim rasmi topilmadi")
        return [front]
    variants = []
    back = open_garment(garments_dir, f"{gid}_orqa") if view == "orqa" else None
    if back is not None:
        variants.append(back)
    if front is not None:
        variants.append(plain_garment(front))
    if not variants:
        raise FileNotFoundError(f"{gid} kiyim rasmi topilmadi ({gid}_old yoki {gid}_orqa)")
    return variants


class Sample:
    """Bitta juftlik, 192x256 da (jonli oyna kadrini qanday kessa, xuddi shunday)"""

    def __init__(self, ready: Path, garments_dir: Path, pair: dict, garment_cache: dict):
        pdir = ready / pair["view"] / pair["person"]

        def read(stem: str):
            img = np.asarray(Image.open(pdir / f"{stem}.jpg").convert("RGB"))
            bg = np.asarray(Image.open(pdir / f"{stem}_fon.png")) > 127
            cloth = np.asarray(Image.open(pdir / f"{stem}_kiyim.png")) > 127
            meta = json.loads((pdir / f"{stem}.json").read_text())
            return img, bg, cloth, np.array(meta["pts"], dtype=np.float32)

        a_img, a_bg, _, a_pts = read(pair["input"])
        b_img, b_bg, b_cloth, b_pts = read(pair["target"])
        h, w = a_img.shape[:2]
        box = upper_body_box((a_pts + b_pts) / 2, (w, h))

        def person(img, bg):
            white = img.copy()
            white[bg] = 255
            return cv2.resize(crop_white(white, box), SIZE, interpolation=cv2.INTER_AREA)

        self.person = person(a_img, a_bg)
        self.target = person(b_img, b_bg)
        tmask = crop_mask((b_cloth & ~b_bg).astype(np.float32), box)
        self.tmask = cv2.resize(tmask, SIZE, interpolation=cv2.INTER_AREA)
        key = (pair["garment"], pair["view"])
        if key not in garment_cache:
            garment_cache[key] = [garment_inputs(g) for g in garment_variants(garments_dir, pair["garment"], pair["view"])]
        self.garments = garment_cache[key]
        self.person_name = pair["person"]


def to_tensors(samples: list[Sample], device, flip: bool):
    """flip=True (o'qitish): tasodifiy aks va kiyim varianti; False (tekshiruv): birinchi variant, aks yo'q"""
    import torch

    def img(a):
        t = torch.from_numpy(np.array(a, dtype=np.float32)).permute(2, 0, 1) / 127.5 - 1
        return t

    def m(a):
        return torch.from_numpy(np.array(a, dtype=np.float32))[None]

    rows = []
    for s in samples:
        cloth_np, edge_np = random.choice(s.garments) if flip else s.garments[0]
        person, target, tmask, cloth, edge = img(s.person), img(s.target), m(s.tmask), img(cloth_np), m(edge_np)
        if flip and random.random() < 0.5:
            person, target, tmask, cloth, edge = (t.flip(-1) for t in (person, target, tmask, cloth, edge))
        rows.append((person, target, tmask, cloth * edge, edge))
    return [torch.stack(col).to(device) for col in zip(*rows)]


class VGGLoss:
    """pix2pixHD perseptual yo'qotish (VGG19 qatlamlari). Og'irliklar yuklanmasa o'chiriladi (faqat L1)"""

    def __init__(self, device):
        import torch
        import torchvision

        vgg = torchvision.models.vgg19(weights=torchvision.models.VGG19_Weights.IMAGENET1K_V1).features.to(device).eval()
        for p in vgg.parameters():
            p.requires_grad_(False)
        self.slices = [vgg[:2], vgg[2:7], vgg[7:12], vgg[12:21], vgg[21:30]]
        self.weights = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1.0]
        self.mean = torch.tensor([0.485, 0.456, 0.406], device=device)[None, :, None, None]
        self.std = torch.tensor([0.229, 0.224, 0.225], device=device)[None, :, None, None]

    def __call__(self, x, y):
        x = ((x + 1) / 2 - self.mean) / self.std
        y = ((y + 1) / 2 - self.mean) / self.std
        loss = 0
        for s, wgt in zip(self.slices, self.weights):
            x, y = s(x), s(y)
            loss = loss + wgt * (x - y.detach()).abs().mean()
        return loss


def preview(path: Path, batch, outputs) -> None:
    """Har qatorda: kirish | kiyim | natija | maqsad"""
    person, target, _, cloth, _ = batch
    to = lambda t: ((t.detach().float().cpu().permute(1, 2, 0).numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)  # noqa: E731
    rows = [np.hstack([to(person[i]), to(cloth[i]), to(outputs[i]), to(target[i])]) for i in range(min(4, person.shape[0]))]
    Image.fromarray(np.vstack(rows)).save(path, quality=90)


VIEWS = ("old", "orqa", "yon")


def main() -> int:
    p = argparse.ArgumentParser(description="Jonli oyna modelini (old, orqa, yon) qo'shimcha o'qitish")
    p.add_argument("--view", default="orqa", choices=[*VIEWS, "hammasi"],
                   help="hammasi: ma'lumoti bor har ko'rinish ketma-ket")
    p.add_argument("--toza", action="store_true",
                   help="Saqlangan ko'rinish modelidan davom etmasdan, asl modeldan boshlash")
    p.add_argument("--dataset", default=str(ROOT / "dataset"))
    p.add_argument("--steps", type=int, default=3000)
    p.add_argument("--batch", type=int, default=4)
    p.add_argument("--lr", type=float, default=2e-5)
    p.add_argument("--val", default=None, help="Tekshiruv uchun ajratiladigan odam papkasi (standart: oxirgisi)")
    p.add_argument("--no-vgg", action="store_true", help="Perseptual yo'qotishsiz (VGG yuklanmasa avtomatik)")
    p.add_argument("--faqat-yaxshi", action="store_true", help="Faqat 'yaxshi' baholangan juftliklar ('o'rtacha'siz)")
    p.add_argument("--every", type=int, default=200, help="Necha qadamda tekshiruv va namuna rasm")
    args = p.parse_args()

    pairs_file = Path(args.dataset) / "_tayyor" / "pairs.json"
    if not pairs_file.exists():
        print("XATO: avval prep.bat ni ishga tushiring (dataset/_tayyor/pairs.json yo'q)")
        return 1
    all_pairs = json.loads(pairs_file.read_text(encoding="utf-8"))
    if args.faqat_yaxshi:
        all_pairs = [q for q in all_pairs if q["grade"] == "yaxshi"]
    views = [v for v in VIEWS if any(q["view"] == v for q in all_pairs)] if args.view == "hammasi" else [args.view]
    if not views:
        print("XATO: yaroqli juftlik yo'q")
        return 1
    code = 0
    for view in views:
        pairs = [q for q in all_pairs if q["view"] == view]
        if not pairs:
            print(f"XATO: '{view}' ko'rinishida yaroqli juftlik yo'q")
            code = 1
            continue
        print(f"\n=== {view} tomon ===")
        train_view(view, pairs, args)
    print("Ishlatish uchun: tryon-local\\stop.bat va start.bat (server yangi og'irliklarni o'zi topadi)")
    return code


def train_view(view: str, pairs: list[dict], args) -> None:
    import torch
    import torch.nn.functional as F

    random.seed(0)
    torch.manual_seed(0)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("DIQQAT: GPU topilmadi, o'qitish juda sekin bo'ladi")
    ds = Path(args.dataset)
    ready = ds / "_tayyor"

    cache: dict = {}
    samples = [Sample(ready, ds / "kiyimlar", q, cache) for q in pairs]
    people = sorted({s.person_name for s in samples})
    val_person = args.val or (people[-1] if len(people) >= 3 else None)
    train = [s for s in samples if s.person_name != val_person]
    val = [s for s in samples if s.person_name == val_person]
    print(f"{view}: {len(train)} o'qitish, {len(val)} tekshiruv juftligi ({len(people)} odam"
          f"{', tekshiruv: ' + val_person if val_person else ''}), qurilma {device}")

    AFWM, Generator = load_model_modules(KISEKLOSET_DIR)
    weights = ensure_weights(MODELS_DIR)
    warp = AFWM(3, True).to(device)
    gen = Generator(7, 4).to(device)
    out_dir = MODELS_DIR / "dmvton"
    saved = (out_dir / f"{view}_warp.pt", out_dir / f"{view}_gen.pt")
    # Saqlangan ko'rinish modeli bo'lsa undan davom etiladi: yangisi faqat undan yaxshi bo'lsa almashtiradi
    if not args.toza and all(f.exists() for f in saved):
        load_state(warp, saved[0])
        load_state(gen, saved[1])
        print(f"Saqlangan {view} modelidan davom etiladi (--toza: asl modeldan)")
    else:
        load_state(warp, weights["warp"])
        load_state(gen, weights["gen"])
    opt = torch.optim.Adam(list(warp.parameters()) + list(gen.parameters()), lr=args.lr, betas=(0.5, 0.999))

    vgg = None
    if not args.no_vgg:
        try:
            vgg = VGGLoss(device)
        except Exception as e:  # noqa: BLE001
            print(f"VGG yuklanmadi ({e}): faqat L1 bilan o'qitiladi")

    def forward(person, cloth, edge):
        warped, flow = warp(person, cloth)
        warped_edge = F.grid_sample(edge, flow.permute(0, 2, 3, 1), mode="bilinear", padding_mode="zeros", align_corners=True)
        out = gen(torch.cat([person, warped, warped_edge], 1))
        rendered, comp = torch.split(out, [3, 1], 1)
        rendered = torch.tanh(rendered)
        comp = torch.sigmoid(comp) * warped_edge
        return warped * comp + rendered * (1 - comp), warped, warped_edge, comp, flow

    def losses(batch):
        person, target, tmask, cloth, edge = batch
        tryon, warped, warped_edge, comp, flow = forward(person, cloth, edge)
        target_cloth = target * tmask + (1 - tmask)  # kiyimdan tashqari oq (egilgan kiyim fonida ham oq)
        warped_white = warped + (1 - warped_edge)
        l_tryon = (tryon - target).abs().mean()
        l_warp = (warped_white - target_cloth).abs().mean()
        l_edge = (warped_edge - tmask).abs().mean()
        l_comp = ((1 - comp) * tmask).abs().mean()
        # Egish silliqligi: siljish maydonining (oqim - aynan joy) qo'shni nuqtalar farqi
        base = F.affine_grid(torch.eye(2, 3, device=device)[None].expand(flow.shape[0], 2, 3), (flow.shape[0], 1, *flow.shape[2:]),
                             align_corners=True).permute(0, 3, 1, 2)
        delta = flow - base
        l_tv = (delta[..., 1:, :] - delta[..., :-1, :]).abs().mean() + (delta[..., 1:] - delta[..., :-1]).abs().mean()
        total = l_tryon + l_warp + 0.5 * l_edge + 0.2 * l_comp + 1.0 * l_tv
        if vgg is not None:
            total = total + 0.2 * vgg(tryon, target) + 0.2 * vgg(warped_white, target_cloth)
        return total, l_tryon, tryon

    runs = ROOT / "runs" / view
    runs.mkdir(parents=True, exist_ok=True)

    def evaluate() -> float:
        if not val:
            return float("nan")
        warp.eval(), gen.eval()
        with torch.no_grad():
            batch = to_tensors(val[:16], device, flip=False)
            _, l1, tryon = losses(batch)
            preview(runs / "tekshiruv_latest.jpg", batch, tryon)
        warp.train(), gen.train()
        return float(l1)

    def save(tag: str) -> None:
        torch.save({"model": warp.state_dict()}, out_dir / f"{view}_warp{tag}.pt")
        torch.save({"model": gen.state_dict()}, out_dir / f"{view}_gen{tag}.pt")

    start_val = evaluate()
    best = start_val
    if val:
        print(f"Boshlang'ich model, tekshiruv L1: {start_val:.4f} (kichikroq = yaxshiroq)")
    warp.train(), gen.train()
    t0 = time.time()
    for step in range(1, args.steps + 1):
        batch = to_tensors(random.sample(train, min(args.batch, len(train))), device, flip=True)
        total, l1, tryon = losses(batch)
        opt.zero_grad(set_to_none=True)
        total.backward()
        opt.step()
        if step % 20 == 0:
            print(f"qadam {step}/{args.steps}  yo'qotish {float(total):.4f}  L1 {float(l1):.4f}  "
                  f"({(time.time() - t0) / step:.2f} s/qadam)", flush=True)
        if step % args.every == 0 or step == args.steps:
            preview(runs / f"qadam_{step:05d}.jpg", batch, tryon.detach())
            v = evaluate()
            if val and v < best:
                best = v
                save("")
                print(f"  tekshiruv L1 {v:.4f}: yaxshilandi, saqlandi -> models/dmvton/{view}_*.pt")
            elif val:
                print(f"  tekshiruv L1 {v:.4f} (eng yaxshisi {best:.4f})")
    if not val and view == "old":
        # Old tomon modeli asl (yaxshi ishlayotgan) modelni almashtiradi: tekshiruvsiz saqlanmaydi
        print("Old tomon uchun kamida 3 odam kerak (biri tekshiruvga): model saqlanmadi")
    elif not val:
        save("")  # tekshiruv odami yo'q (kam ma'lumot): oxirgi holat saqlanadi
        print(f"Saqlandi: models/dmvton/{view}_*.pt (tekshiruv yo'q, kamida 3 odam kerak)")
    elif best >= start_val:
        print("Model tekshiruvda yaxshilanmadi: fayllar saqlanmadi (ko'proq yoki sifatliroq ma'lumot kerak)")
    print(f"Namuna rasmlar: {runs}")



if __name__ == "__main__":
    sys.exit(main())
