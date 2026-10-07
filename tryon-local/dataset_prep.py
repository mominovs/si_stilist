"""
Jonli oyna o'qitish to'plamini tekshirish va tayyorlash (prep.bat).

Kutilgan tuzilma (dataset/README.md):
    dataset/kiyimlar/k01_old.png, k01_orqa.png, k01_yon.png (yon ixtiyoriy)
    dataset/<ko'rinish>/<odam>/<kiyim>.jpg      ko'rinish: orqa | yon | old; masalan dataset/orqa/o01/k03.jpg
    Odam papkasidagi kiyim nomiga mos kelmaydigan rasm (masalan asosiy.jpg) asosiy surat: u faqat KIRISH bo'ladi.

Har bir odam papkasida:
  1. Hamma rasm asosiy suratga tekislanadi (ECC, affin): rasm generatori tahrirda kadrni ozgina siljitadi.
  2. Har bir rasmda kiyim niqobi, fon va poza (MediaPipe, masker.py).
  3. Har juftlik (kirish, natija) baholanadi: kiyimdan tashqarida (yuz, soch, shim, fon) farq va poza siljishi.
     Bu qismlar o'zgarmasligi kerak: aks holda model "kiyim almashtirish" o'rniga boshqa narsani o'rganadi.

Natija:
    dataset/_tayyor/...   tekislangan rasmlar, niqoblar va poza (train_mirror.py shuni o'qiydi)
    dataset/hisobot.txt   har rasm va juftlik bahosi
    dataset/hisobot.jpg   jamlangan rasm (yashil: yaxshi, sariq: o'rtacha, qizil: yaroqsiz)
"""

from __future__ import annotations

import argparse
import json
import sys
from itertools import permutations
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
VIEWS = ("orqa", "yon", "old")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
WORK_SIDE = 1024  # tahlil va saqlash: uzun tomoni shuncha (o'qitish 192x256 da, ortig'i kerak emas)
# Juftlik bahosi: kiyimdan tashqaridagi o'rtacha farq (0..255) va poza siljishi (yelka kengligiga nisbatan)
OK_DIFF, WARN_DIFF = 10.0, 18.0
OK_POSE, WARN_POSE = 0.08, 0.15  # bir xil pozada ham MediaPipe nuqtalari kiyimga qarab ~2-6% titraydi
POSE_POINTS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]  # burun, quloqlar, yelka, tirsak, bilak, son


def load(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    img.thumbnail((WORK_SIDE, WORK_SIDE))
    return np.asarray(img)


def align(ref: np.ndarray, img: np.ndarray, keep: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """img ni ref ga affin tekislaydi (faqat keep=1 joylar, ya'ni kiyimdan tashqari). Qaytadi: rasm, matritsa, siljish px"""
    h, w = ref.shape[:2]
    if img.shape[:2] != (h, w):
        img = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
    s = 512 / max(h, w)
    small = lambda a: cv2.resize(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), None, fx=s, fy=s).astype(np.float32)  # noqa: E731
    mask = cv2.resize(keep.astype(np.uint8), None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5)
        _, warp = cv2.findTransformECC(small(ref), small(img), warp, cv2.MOTION_AFFINE, criteria, mask, 5)
    except cv2.error:
        return img, np.eye(2, 3, dtype=np.float32), 0.0
    warp[:, 2] /= s
    # Siljish: burchaklar eng ko'p qancha piksel ko'chdi (surilish, aylanish va masshtab birga)
    corners = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], dtype=np.float32)
    shift = float(np.linalg.norm(corners @ warp.T - corners[:, :2], axis=1).max())
    aligned = cv2.warpAffine(img, warp, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    return aligned, warp, shift


def grade(diff: float, pose: float) -> str:
    if diff <= OK_DIFF and pose <= OK_POSE:
        return "yaxshi"
    if diff <= WARN_DIFF and pose <= WARN_POSE:
        return "orta"
    return "yaroqsiz"


COLORS = {"yaxshi": (34, 197, 94), "orta": (245, 158, 11), "yaroqsiz": (239, 68, 68)}


def check_garments(garments_dir: Path, out: Path) -> None:
    """
    Kiyim rasmlari model ko'radigan ko'rinishda (niqob ichi, tashqarisi kulrang): oq kiyim oq fonda kesilmay
    qolganini o'qitishdan oldin ko'rish uchun. Niqob o'z chegara to'rtburchagining 45% idan kam bo'lsa ogohlantiradi.
    """
    from mirror import garment_inputs

    tiles = []
    for f in sorted(x for x in garments_dir.iterdir() if x.suffix.lower() in IMAGE_EXT):
        try:
            cloth, edge = garment_inputs(Image.open(f).convert("RGB"), (192, 256))
        except ValueError:
            print(f"  DIQQAT: {f.name}: kiyim topilmadi")
            continue
        ys, xs = np.nonzero(edge)
        fill = float(edge.sum()) / max(1, (np.ptp(xs) + 1) * (np.ptp(ys) + 1))
        bad = fill < 0.45
        if bad:
            print(f"  DIQQAT: {f.name}: kiyim niqobi shubhali (to'ldirilish {fill:.0%}), kiyimlar_hisobot.jpg ni ko'ring")
        tile = np.where(edge[..., None] > 0, cloth, 128).astype(np.uint8)
        tile = cv2.copyMakeBorder(tile, 4, 22, 4, 4, cv2.BORDER_CONSTANT, value=COLORS["yaroqsiz" if bad else "yaxshi"])
        cv2.putText(tile, f.stem, (6, tile.shape[0] - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(tile)
    if tiles:
        rows = [np.hstack(tiles[i:i + 8] + [np.full_like(tiles[0], 255)] * (8 - len(tiles[i:i + 8]))) for i in range(0, len(tiles), 8)]
        Image.fromarray(np.vstack(rows)).save(out, quality=90)


def main() -> int:
    p = argparse.ArgumentParser(description="Jonli oyna o'qitish to'plamini tekshirish va tayyorlash")
    p.add_argument("--dataset", default=str(ROOT / "dataset"))
    args = p.parse_args()
    ds = Path(args.dataset)
    garments_dir = ds / "kiyimlar"
    if not garments_dir.exists():
        print(f"XATO: {garments_dir} topilmadi")
        return 1
    garments = sorted({f.stem.rsplit("_", 1)[0] for f in garments_dir.iterdir() if f.suffix.lower() in IMAGE_EXT and "_" in f.stem})
    print(f"Kiyimlar: {len(garments)} ta ({', '.join(garments)})")
    check_garments(garments_dir, ds / "kiyimlar_hisobot.jpg")

    from masker import ClothMasker, PhotoError

    masker = ClothMasker(ROOT / "models")
    out_root = ds / "_tayyor"
    report: list[str] = []
    pairs: list[dict] = []
    sheet_rows: list[np.ndarray] = []
    totals = {"yaxshi": 0, "orta": 0, "yaroqsiz": 0}

    for view in VIEWS:
        vdir = ds / view
        if not vdir.exists():
            continue
        for pdir in sorted(d for d in vdir.iterdir() if d.is_dir()):
            files = sorted(f for f in pdir.iterdir() if f.suffix.lower() in IMAGE_EXT)
            worn = [f for f in files if f.stem in garments]
            bases = [f for f in files if f.stem not in garments]
            if len(worn) < 2 and not (worn and bases):
                report.append(f"{view}/{pdir.name}: juftlik uchun kamida 2 ta rasm kerak, o'tkazib yuborildi")
                continue
            ref_path = (bases or worn)[0]
            ref = load(ref_path)
            items: dict[str, dict] = {}
            # 1-o'tish: niqob (tekislash uchun kiyim joyini bilish kerak), keyin tekislash va qayta tahlil
            ref_info = None
            try:
                ref_mask, _, ref_bg, _ = masker.analyze(Image.fromarray(ref), "tops")
                ref_info = (np.asarray(ref_mask) > 127, ref_bg, masker.last_landmarks.copy(), masker.last_visibility.copy())
            except PhotoError as e:
                report.append(f"{view}/{pdir.name}/{ref_path.name}: asosiy suratda xato: {e}")
                continue
            for f in files:
                img = ref if f == ref_path else load(f)
                shift = 0.0
                if f != ref_path:
                    try:
                        m, _, _, _ = masker.analyze(Image.fromarray(cv2.resize(img, ref.shape[1::-1])), "tops")
                        cloth = np.asarray(m) > 127
                    except PhotoError:
                        cloth = np.zeros(ref.shape[:2], bool)
                    keep = ~cv2.dilate((ref_info[0] | cloth).astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool)
                    img, _, shift = align(ref, img, keep)
                try:
                    mask, _, bg, sw = masker.analyze(Image.fromarray(img), "tops")
                except PhotoError as e:
                    report.append(f"{view}/{pdir.name}/{f.name}: yaroqsiz ({e})")
                    continue
                items[f.stem] = {
                    "file": f,
                    "img": img,
                    "mask": np.asarray(mask) > 127,
                    "bg": bg,
                    "pts": masker.last_landmarks.copy(),
                    "vis": masker.last_visibility.copy(),
                    "sw": sw,
                    "shift": shift,
                    "garment": f.stem if f.stem in garments else None,
                }

            # Saqlash (o'qitish shu fayllarni o'qiydi)
            odir = out_root / view / pdir.name
            odir.mkdir(parents=True, exist_ok=True)
            for stem, it in items.items():
                Image.fromarray(it["img"]).save(odir / f"{stem}.jpg", quality=95)
                Image.fromarray(it["mask"].astype(np.uint8) * 255).save(odir / f"{stem}_kiyim.png")
                Image.fromarray(it["bg"].astype(np.uint8) * 255).save(odir / f"{stem}_fon.png")
                (odir / f"{stem}.json").write_text(json.dumps({
                    "pts": it["pts"].round(2).tolist(),
                    "vis": it["vis"].round(3).tolist(),
                    "garment": it["garment"],
                }))

            # Juftliklar: kirish istalgan rasm, natija faqat kiyimi ma'lum rasm
            thumbs = []
            # Rasm rangi: eng yaxshi juftligi bo'yicha (bitta buzuq rasm boshqalarini qizil qilmasin)
            best = {stem: "yaroqsiz" for stem in items}
            rank = {"yaxshi": 0, "orta": 1, "yaroqsiz": 2}
            for a, b in permutations(items, 2):
                ia, ib = items[a], items[b]
                if ib["garment"] is None:
                    continue
                changed = cv2.dilate((ia["mask"] | ib["mask"]).astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
                outside = ~changed
                diff = float(np.abs(ia["img"].astype(np.int16) - ib["img"].astype(np.int16)).mean(axis=2)[outside].mean())
                sel = [i for i in POSE_POINTS if ia["vis"][i] > 0.5 and ib["vis"][i] > 0.5]
                pose = float(np.median(np.linalg.norm(ia["pts"][sel] - ib["pts"][sel], axis=1)) / ib["sw"]) if sel else 1.0
                g = grade(diff, pose)
                totals[g] += 1
                for stem in (a, b):
                    if rank[g] < rank[best[stem]]:
                        best[stem] = g
                report.append(f"{view}/{pdir.name}: {a} -> {b}: {g} (farq {diff:.1f}, poza {pose:.3f})")
                if g != "yaroqsiz":
                    pairs.append({"view": view, "person": pdir.name, "input": a, "target": b, "garment": ib["garment"],
                                  "grade": g, "diff": round(diff, 2), "pose": round(pose, 4)})
            # Jamlangan rasm qatori: har rasm, ramkasi eng yomon juftligi rangida, tekislash siljishi bilan
            for stem, it in items.items():
                t = cv2.resize(it["img"], (180, int(180 * it["img"].shape[0] / it["img"].shape[1])))
                t = cv2.copyMakeBorder(t, 6, 26, 6, 6, cv2.BORDER_CONSTANT, value=COLORS[best[stem]])
                cv2.putText(t, f"{pdir.name}/{stem} {it['shift']:.0f}px", (8, t.shape[0] - 8), cv2.FONT_HERSHEY_SIMPLEX,
                            0.45, (255, 255, 255), 1, cv2.LINE_AA)
                thumbs.append(t)
            if thumbs:
                hmax = max(t.shape[0] for t in thumbs)
                row = np.hstack([cv2.copyMakeBorder(t, 0, hmax - t.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in thumbs])
                sheet_rows.append(row)

    (out_root).mkdir(parents=True, exist_ok=True)
    (out_root / "pairs.json").write_text(json.dumps(pairs, indent=1, ensure_ascii=False))
    summary = (f"Juftliklar: yaxshi {totals['yaxshi']}, o'rtacha {totals['orta']}, yaroqsiz {totals['yaroqsiz']}. "
               f"O'qitishga: {len(pairs)} ta")
    (ds / "hisobot.txt").write_text(summary + "\n\n" + "\n".join(report), encoding="utf-8")
    if sheet_rows:
        wmax = max(r.shape[1] for r in sheet_rows)
        sheet = np.vstack([cv2.copyMakeBorder(r, 0, 8, 0, wmax - r.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for r in sheet_rows])
        Image.fromarray(sheet).save(ds / "hisobot.jpg", quality=88)
    print(summary)
    print(f"Hisobot: {ds / 'hisobot.txt'} va {ds / 'hisobot.jpg'}")
    return 0 if pairs else 1


if __name__ == "__main__":
    sys.exit(main())
