"""
Jonli oyna: DM-VTON (real vaqtda kiyintirish, 192x256, bir kadr ~10-25 ms GPU'da).

Kadr tayyorlash mualliflar demosidagidek (github.com/KiseKloset/KiseKloset): fon oqqa almashtiriladi, ko'zdan
songacha yuqori gavda kesib olinadi, 192x256 ga keltiriladi. Natija kesim joyiga qaytariladi va faqat kiyim niqobi
(masker.py) ichida asl kadrga yopishtiriladi: yuz, soch va fon o'zgarmaydi.

Model kodi demo repozitoriysidan yuklanadi (og'irliklar aynan shu kod bilan saqlangan). Asl korrelyatsiya qatlami
cupy (CUDA yadrosi) talab qiladi: u bu yerda oddiy PyTorch bilan aynan takrorlangan, shuning uchun cupy kerak emas.
"""

from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

KISEKLOSET_COMMIT = "118e0da5037550912cf33b1b7bdd46ecf36141e7"
MODEL_SUBDIR = Path("src/api/tryon/service/dm_vton/models")
# Og'irliklar ikki manbadan (ikkala model ta'rifi kalit va o'lcham bo'yicha aynan bir xil, tekshirilgan):
# 1) mualliflar demosi (alohida fayllar), 2) DM-VTON repozitoriysining Drive papkasi (README'dagi havola)
WEIGHT_NAMES = {"warp": ("mobile_warp.pt", "dmvton_pf_warp.pt"), "gen": ("mobile_gen.pt", "dmvton_pf_gen.pt")}
DEMO_FILE_IDS = {"warp": "1KJNKjqBeUF9CLcCRFyjONmKzcqjNgj9z", "gen": "1TP2OiEixy1WEjbJsdDYGL-214v_zkqUV"}
REPO_FOLDER_ID = "1wfWGsR0vWC5LrA26xhj92ec_GoCKV80A"
MANUAL_HELP = (
    "Jonli oyna og'irliklarini Google Drive'dan avtomatik yuklab bo'lmadi (limit yoki ruxsat). Qo'lda yuklang:\n"
    "  1) https://drive.google.com/drive/folders/" + REPO_FOLDER_ID + " dan dmvton_pf_warp.pt va dmvton_pf_gen.pt\n"
    "     (yoki https://drive.google.com/uc?id=" + DEMO_FILE_IDS["warp"] + " va https://drive.google.com/uc?id="
    + DEMO_FILE_IDS["gen"] + ")\n"
    "  2) ikkala faylni tryon-local\\models\\dmvton\\ papkasiga qo'ying, keyin start.bat"
)
SIZE = (192, 256)  # (w, h): model shu o'lchamda o'qitilgan
# Kiyim teksturasi shu o'lchamda saqlanadi: model hisoblagan egish xaritasi kattalashtirilib, kiyimning tiniq
# nusxasiga qo'llanadi (yoqa, naqsh, chok 192x256 dagidek xira bo'lmaydi)
HR_SIZE = (576, 768)

# Poza nuqtalari (MediaPipe)
L_EYE, R_EYE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP = 2, 5, 11, 12, 23, 24
L_WRIST, R_WRIST = 15, 16
# masker.py dagi selfie_multiclass sinflari (mediapipe'ni bu yerda import qilmaslik uchun takrorlangan)
SEG_HAIR, SEG_FACE_SKIN = 1, 3
# Qaysi tomon: old (oddiy kiyim rasmi), yon va orqa (naqshsiz "tekis" kiyim yoki do'konning orqa surati)
VIEWS = ("old", "yon", "orqa")
# Harakatda niqob kuzatuvi (optik oqim) shu kenglikdagi kulrang kadrda hisoblanadi
TRACK_W = 160
# Xonadagi yorug'likni yangi kiyimga o'tkazish: kuchi, chegarasi va xiralik radiusi (yelka kengligiga nisbatan).
# Radius katta: faqat keng yorug'lik/soya o'tadi, eski kiyimdagi naqsh va yozuvlar o'tmaydi
SHADE_STRENGTH = 0.7
SHADE_RANGE = (0.75, 1.2)
SHADE_SIGMA = 0.12


def correlation(first, second, intStride: int = 1):
    """
    FlowNet2 korrelyatsiyasi (DM-VTON'dagi cupy yadrosi bilan bir xil): har bir piksel uchun 7x7 siljishlar
    (-3..3) bo'yicha kanallar o'rtachasi, chetlari nol bilan to'ldiriladi. Chiqish: N x 49 x H x W,
    kanal tartibi: k = (dy + 3) * 7 + (dx + 3).
    """
    import torch.nn.functional as F
    import torch

    assert intStride == 1, "DM-VTON faqat intStride=1 ishlatadi"
    n, c, h, w = first.shape
    padded = F.pad(second, (3, 3, 3, 3))
    out = []
    for dy in range(7):
        for dx in range(7):
            out.append((first * padded[:, :, dy:dy + h, dx:dx + w]).mean(dim=1, keepdim=True))
    return torch.cat(out, dim=1)


def _find_weights(target: Path) -> dict[str, Path]:
    """Papkada (ichki papkalar bilan) bor og'irliklar: har bir tur uchun ikkala nomdan biri"""
    found = {}
    for kind, names in WEIGHT_NAMES.items():
        for name in names:
            hits = [p for p in target.rglob(name) if p.stat().st_size > 100_000]
            if hits:
                found[kind] = hits[0]
                break
    return found


def ensure_weights(models_dir: Path) -> dict[str, Path]:
    """
    Og'irliklarni topadi yoki Google Drive'dan yuklaydi (gdown tasdiqlash sahifasini o'zi o'tadi). Drive ba'zan
    "juda ko'p yuklab olish" deb rad etadi: unda ikkinchi manba, u ham bo'lmasa qo'lda yuklash ko'rsatmasi.
    """
    target = models_dir / "dmvton"
    target.mkdir(parents=True, exist_ok=True)
    found = _find_weights(target)
    if len(found) == len(WEIGHT_NAMES):
        return found
    try:
        import gdown
    except ImportError as e:
        raise RuntimeError(MANUAL_HELP) from e

    # 1-manba: mualliflar demosidagi alohida fayllar
    for kind in WEIGHT_NAMES:
        if kind in found:
            continue
        path = target / WEIGHT_NAMES[kind][0]
        print(f"[oyna] {path.name} yuklanmoqda...", flush=True)
        try:
            gdown.download(id=DEMO_FILE_IDS[kind], output=str(path), quiet=True)
        except Exception as e:  # noqa: BLE001 - keyingi manbaga o'tiladi
            print(f"[oyna] demo manbasi ishlamadi: {str(e).splitlines()[0]}", flush=True)
            path.unlink(missing_ok=True)
    found = _find_weights(target)

    # 2-manba: DM-VTON repozitoriysining papkasi (faqat kerakli fayllar yuklanadi)
    if len(found) < len(WEIGHT_NAMES):
        try:
            print("[oyna] DM-VTON papkasidan qidirilmoqda...", flush=True)
            listing = gdown.download_folder(id=REPO_FOLDER_ID, output=str(target / "repo"), quiet=True, skip_download=True)
            wanted = {n for kind in WEIGHT_NAMES if kind not in found for n in WEIGHT_NAMES[kind]}
            for item in listing or []:
                name = Path(item.path).name
                if name in wanted:
                    print(f"[oyna] {name} yuklanmoqda...", flush=True)
                    gdown.download(id=item.id, output=str(target / name), quiet=True)
        except Exception as e:  # noqa: BLE001
            print(f"[oyna] DM-VTON papkasi ishlamadi: {str(e).splitlines()[0]}", flush=True)
        found = _find_weights(target)

    if len(found) < len(WEIGHT_NAMES):
        raise RuntimeError(MANUAL_HELP)
    return found


def load_model_modules(repo: Path):
    """Demo repozitoriysidagi model fayllarini korrelyatsiya o'rnini bosuvchi bilan yuklaydi (cupy'siz)."""
    models_dir = repo / MODEL_SUBDIR
    if not (models_dir / "afwm_test.py").exists():
        raise RuntimeError(f"{models_dir} topilmadi. setup.bat ni qayta ishga tushiring")
    pkg = types.ModuleType("dmvton_models")
    pkg.__path__ = [str(models_dir)]
    corr_pkg = types.ModuleType("dmvton_models.correlation")
    corr_pkg.__path__ = []
    corr_mod = types.ModuleType("dmvton_models.correlation.correlation")
    corr_mod.FunctionCorrelation = lambda tenFirst, tenSecond, intStride=1: correlation(tenFirst, tenSecond, intStride)
    corr_pkg.correlation = corr_mod
    sys.modules.update({
        "dmvton_models": pkg,
        "dmvton_models.correlation": corr_pkg,
        "dmvton_models.correlation.correlation": corr_mod,
    })
    afwm = importlib.import_module("dmvton_models.afwm_test")
    gen = importlib.import_module("dmvton_models.mobile_unet_generator")
    return afwm.AFWM, gen.MobileNetV2_unet


def load_state(model, path: Path) -> None:
    """Demodagi load_ckpt bilan bir xil: model kalitlari bo'yicha olinadi (ortiqchalari e'tiborsiz qoladi)"""
    import torch

    ckpt = torch.load(path, map_location="cpu")
    pretrained = ckpt.get("model") or ckpt
    state = model.state_dict()
    missing = [k for k in state if k not in pretrained]
    if missing:
        raise RuntimeError(f"{path.name}: og'irliklarda {len(missing)} ta kalit yo'q (masalan {missing[0]})")
    model.load_state_dict({k: pretrained[k] for k in state})


def garment_inputs(image: Image.Image, size: tuple[int, int] = SIZE) -> tuple[np.ndarray, np.ndarray]:
    """
    Oq fondagi kiyim rasmi -> (kiyim HxWx3 uint8, kontur HxW 0/1), standart 256x192. Kiyim kesib olinib, 3:4 nisbatda
    ozgina zaxira bilan markazlashtiriladi (VITON'dagi kiyim rasmlari kadrni deyarli to'liq egallaydi).
    """
    rgb = np.asarray(image.convert("RGB"))
    fg = (rgb.min(axis=2) < 235).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    # Ichki teshiklar (oq naqsh, tugmalar) ham kiyim: tashqi kontur to'liq bo'yaladi
    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("Kiyim rasmida kiyim topilmadi")
    mask = np.zeros_like(fg)
    cv2.drawContours(mask, contours, -1, 1, thickness=-1)
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bw, bh = x1 - x0, y1 - y0
    side_h = max(bh, bw * 4 / 3) * 1.08
    side_w = side_h * 3 / 4
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box = (int(cx - side_w / 2), int(cy - side_h / 2), int(cx + side_w / 2), int(cy + side_h / 2))
    canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (255, 255, 255))
    canvas.paste(image.convert("RGB"), (-box[0], -box[1]))
    mcanvas = Image.new("L", canvas.size, 0)
    mcanvas.paste(Image.fromarray(mask * 255), (-box[0], -box[1]))
    cloth = np.asarray(canvas.resize(size, Image.LANCZOS if size[0] > SIZE[0] else Image.BICUBIC))
    edge = (np.asarray(mcanvas.resize(size, Image.BILINEAR)) > 127).astype(np.float32)
    return cloth, edge


def upper_body_box(points: np.ndarray, frame_size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Demodagidek: ko'zlar va sonlar chegarasi, tepa/past 1/5, yonlar 1x zaxira; keyin 3:4 ga kengaytiriladi"""
    sel = points[[L_EYE, R_EYE, L_HIP, R_HIP]]
    x0, y0 = sel.min(axis=0)
    x1, y1 = sel.max(axis=0)
    bw, bh = x1 - x0, y1 - y0
    y0, y1 = y0 - bh / 5, y1 + bh / 5
    x0, x1 = x0 - bw, x1 + bw
    w, h = x1 - x0, y1 - y0
    if w / h < 0.75:
        w = h * 0.75
    else:
        h = w / 0.75
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return int(cx - w / 2), int(cy - h / 2), int(cx + w / 2), int(cy + h / 2)


def crop_white(image: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """Kadrdan tashqariga chiqadigan qismi oq bilan to'ldirilgan kesim (fon ham oq)"""
    x0, y0, x1, y1 = box
    h, w = image.shape[:2]
    out = np.full((y1 - y0, x1 - x0, 3), 255, np.uint8)
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    if sx1 > sx0 and sy1 > sy0:
        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = image[sy0:sy1, sx0:sx1]
    return out


def plain_garment(image: Image.Image) -> Image.Image:
    """
    Kiyimning naqshsiz "tekis" varianti (orqa va yon ko'rinish uchun, do'konda orqa surati bo'lmasa): rang va keng
    soyalar qoladi, oldidagi yozuv, naqsh va tugmalar xiralashib yo'qoladi, bo'yin o'yig'i qisman yopiladi
    (orqa yoqa odatda balandroq). Taxminiy: ikki rangli kiyimda ranglar aralashib ketadi.
    """
    rgb = np.asarray(image.convert("RGB")).astype(np.float32)
    fg = (rgb.min(axis=2) < 235).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("Kiyim rasmida kiyim topilmadi")
    mask = np.zeros_like(fg)
    cv2.drawContours(mask, contours, -1, 1, thickness=-1)
    ys, xs = np.nonzero(mask)
    gw, top, bottom = int(xs.max() - xs.min()), int(ys.min()), int(ys.max())
    # Bo'yin o'yig'i: faqat yuqori chorakda katta yopish (qo'ltiq burchaklari o'zgarmaydi)
    k = max(3, int(gw * 0.14)) | 1
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    neck = top + int(0.25 * (bottom - top))
    out_mask = mask.copy()
    out_mask[:neck] = closed[:neck]
    # Naqshni yo'qotish: faqat kiyim piksellari bo'yicha keng xiralash (fonning oq rangi aralashmaydi)
    m = mask.astype(np.float32)
    sigma = max(2.0, gw * 0.06)
    num = cv2.GaussianBlur(rgb * m[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(m, (0, 0), sigma)[..., None]
    median = np.median(rgb[mask > 0], axis=0)
    smooth = np.where(den > 0.05, num / np.maximum(den, 1e-4), median)
    out = np.full_like(rgb, 255.0)
    out[out_mask > 0] = smooth[out_mask > 0]
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


class MirrorEngine:
    """DM-VTON modeli va kiyimlar keshi. Kadrlar ketma-ket (bitta oqimda) ishlanadi."""

    def __init__(self, repo: Path, models_dir: Path, device: str):
        import torch

        self.torch = torch
        self.device = device
        weights = ensure_weights(models_dir)
        AFWM, Generator = load_model_modules(repo)
        self.warp = AFWM(3, True).to(device).eval()
        self.gen = Generator(7, 4).to(device).eval()
        load_state(self.warp, weights["warp"])
        load_state(self.gen, weights["gen"])
        self.garments: dict[str, dict[str, tuple]] = {}

    def _tensor(self, arr: np.ndarray, normalize: bool = True):
        t = self.torch.from_numpy(np.ascontiguousarray(arr)).float()
        t = t.permute(2, 0, 1) / 255.0 if t.ndim == 3 else t[None]
        if normalize:
            t = t * 2 - 1
        return t[None].to(self.device)

    def _inputs(self, image: Image.Image) -> tuple:
        cloth, edge = garment_inputs(image)
        clothes = self._tensor(cloth) * self.torch.from_numpy(edge).to(self.device)[None, None]
        cloth_hr, edge_hr = garment_inputs(image, HR_SIZE)
        clothes_hr = self._tensor(cloth_hr) * self.torch.from_numpy(edge_hr).to(self.device)[None, None]
        return clothes, self._tensor(edge, normalize=False), clothes_hr

    def set_garment(self, garment_id: str, image: Image.Image, back: Image.Image | None = None) -> None:
        """Uch ko'rinish: old (rasm), yon (tekis variant), orqa (do'kon surati yoki tekis variant)"""
        plain = self._inputs(plain_garment(image))
        self.garments[garment_id] = {
            "old": self._inputs(image),
            "yon": plain,
            "orqa": self._inputs(back) if back is not None else plain,
        }
        if len(self.garments) > 32:
            self.garments.pop(next(iter(self.garments)))

    def run(
        self, person: np.ndarray, garment_id: str, out_size: tuple[int, int] | None = None, view: str = "old"
    ) -> np.ndarray:
        """
        person: 256x192x3 uint8 (oq fonda) -> natija out_size (w, h) da, uint8.
        out_size kattaroq bo'lsa: egish xaritasi (last_flow, normallashgan [-1, 1] koordinatalar) kattalashtirilib
        kiyimning tiniq nusxasiga qo'llanadi; model chizgan qism (teri, soya) va aralashtirish niqobi esa silliq
        kattalashtiriladi. Model hisobi o'zgarmaydi, qo'shimcha xarajat bitta grid_sample.
        """
        import torch.nn.functional as F

        clothes, edge, clothes_hr = self.garments[garment_id][view]
        with self.torch.no_grad():
            img = self._tensor(person)
            warped_cloth, last_flow = self.warp(img, clothes)
            warped_edge = F.grid_sample(edge, last_flow.permute(0, 2, 3, 1), mode="bilinear",
                                        padding_mode="zeros", align_corners=True)
            out = self.gen(self.torch.cat([img, warped_cloth, warped_edge], 1))
            rendered, comp = self.torch.split(out, [3, 1], 1)
            rendered = self.torch.tanh(rendered)
            comp = self.torch.sigmoid(comp) * warped_edge
            if out_size and out_size[0] > SIZE[0]:
                w, h = out_size
                up = lambda t: F.interpolate(t, size=(h, w), mode="bilinear", align_corners=True)  # noqa: E731
                grid = up(last_flow).permute(0, 2, 3, 1)
                warped_hr = F.grid_sample(clothes_hr, grid, mode="bilinear", padding_mode="zeros", align_corners=True)
                comp_hr = up(comp)
                tryon = warped_hr * comp_hr + up(rendered) * (1 - comp_hr)
            else:
                tryon = warped_cloth * comp + rendered * (1 - comp)
        arr = ((tryon[0].permute(1, 2, 0).float().cpu().numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)
        if out_size and (arr.shape[1], arr.shape[0]) != tuple(out_size):
            arr = cv2.resize(arr, tuple(out_size), interpolation=cv2.INTER_CUBIC)
        return arr


def prepare_analysis(
    frame_size: tuple[int, int],
    mask: Image.Image,
    background: np.ndarray,
    points: np.ndarray,
    prev: dict | None = None,
    frame: np.ndarray | None = None,
) -> dict:
    """
    Niqob va pozadan kadr uchun kerakli hamma narsa (niqob yangilanganda bir marta hisoblanadi, kadrlar qayta
    ishlatadi): silliqlangan poza nuqtalari, yuqori gavda kesimi, yumshoq niqob.
    Poza oldingisi bilan o'rtachalanadi: kesim har yangilanishda sakramaydi (kiyim titramaydi).
    """
    w, h = frame_size
    if prev is not None and prev.get("size") == frame_size:
        points = 0.5 * points + 0.5 * prev["points"]
    box = upper_body_box(points, (w, h))
    x0, y0, x1, y1 = box
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    # Model kesimdagi fonni oq chizadi: niqobning fonga kirgan qismi olinmaydi (aks holda oq hoshiya chiqadi).
    # Niqob faqat kesim ichida amal qiladi; chegarasi yumshatiladi
    m = (np.asarray(mask, dtype=np.float32) / 255.0) * (~background)
    inside = np.zeros_like(m)
    inside[sy0:sy1, sx0:sx1] = 1
    soft = cv2.GaussianBlur(m * inside, (0, 0), max(1.5, w / 250))[..., None]
    out = {"size": frame_size, "points": points, "box": box, "bg": background, "soft": soft}
    if frame is not None:
        # Keyingi kadrlarda niqobni tanaga ergashtirish uchun (track_analysis)
        out["small"] = small_gray(frame)
    return out


def small_gray(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    return cv2.resize(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), (TRACK_W, max(1, round(h * TRACK_W / w))),
                      interpolation=cv2.INTER_AREA)


_flow = None
_grid_cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}


def track_analysis(analysis: dict, rgb: np.ndarray) -> tuple[dict, float]:
    """
    Niqob har ~0.12 s da yangilanadi, odam esa shu orada siljiydi (ayniqsa aylanganda): kiyim orqada qolib, eski
    kiyim chetlari ko'rinardi. Niqob tahlil qilingan kadrdan joriy kadrgacha optik oqim (DIS, 160 px kenglikda,
    ~1 ms) bilan suriladi. Qaytadi: (joriy kadrga moslangan tahlil, kiyim ichidagi o'rtacha harakat, px kichik
    o'lchamda). Harakat juda kichik bo'lsa tahlil o'zgarmaydi.
    """
    global _flow
    ref = analysis.get("small")
    if ref is None:
        return analysis, 0.0
    cur = small_gray(rgb)
    if cur.shape != ref.shape:
        return analysis, 0.0
    if _flow is None:
        _flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_ULTRAFAST)
    flow = _flow.calc(cur, ref, None)  # cur(x) ~ ref(x + flow(x))
    sh, sw = cur.shape
    inside = cv2.resize(analysis["soft"][..., 0], (sw, sh), interpolation=cv2.INTER_AREA) > 0.5
    if inside.sum() < 20:
        return analysis, 0.0
    fx, fy = flow[..., 0][inside], flow[..., 1][inside]
    motion = float(np.mean(np.hypot(fx, fy)))
    if motion < 0.25:
        return analysis, motion
    h, w = rgb.shape[:2]
    scale = w / TRACK_W
    full = cv2.resize(flow, (w, h), interpolation=cv2.INTER_LINEAR) * scale
    if (w, h) not in _grid_cache:
        _grid_cache[(w, h)] = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    gx, gy = _grid_cache[(w, h)]
    mx, my = gx + full[..., 0], gy + full[..., 1]
    soft = cv2.remap(analysis["soft"][..., 0], mx, my, cv2.INTER_LINEAR, borderValue=0)[..., None]
    bg = cv2.remap(analysis["bg"].astype(np.uint8), mx, my, cv2.INTER_NEAREST, borderValue=1).astype(bool)
    # Kesim butun gavda siljishi bo'yicha suriladi (ref dagi p nuqta joriy kadrda p - flow da)
    dx, dy = -float(np.median(fx)) * scale, -float(np.median(fy)) * scale
    x0, y0, x1, y1 = analysis["box"]
    box = (int(round(x0 + dx)), int(round(y0 + dy)), int(round(x1 + dx)), int(round(y1 + dy)))
    return {**analysis, "soft": soft, "bg": bg, "box": box}, motion


def body_view(
    points: np.ndarray,
    z: np.ndarray,
    visibility: np.ndarray,
    seg: np.ndarray,
    frame_size: tuple[int, int],
) -> dict:
    """
    Odam kameraga qaysi tomoni bilan turibdi (bitta tahlil uchun; silliqlash serverda):
     - orqa: yelkadan yuqorida yuz terisi deyarli yo'q, soch bor (eng ishonchli belgi) yoki yelkalar teskari
     - yon: yelkalar chuqurlikda ajralgan (MediaPipe z) yoki yelka kengligi gavda uzunligiga nisbatan juda tor
     - old: qolgani (3/4 burilish ham: model uni yaxshi ko'taradi)
    arms_up: bilaklar yelkadan yuqorida (model shu pozada o'qitilmagan, kiyim buziladi)
    """
    w, h = frame_size
    ls, rs = points[L_SHOULDER], points[R_SHOULDER]
    dx = float(ls[0] - rs[0]) / w  # oldda chap yelka kadrning o'ng tomonida: dx > 0
    dz = float(z[L_SHOULDER] - z[R_SHOULDER])
    yaw = float(np.degrees(np.arctan2(dz, dx)))
    top = int(np.clip(min(ls[1], rs[1]), 0, h))
    head = seg[:top]
    face, hair = int((head == SEG_FACE_SKIN).sum()), int((head == SEG_HAIR).sum())
    face_share = face / (face + hair) if face + hair > 0.002 * w * h else None
    torso = float(np.linalg.norm((ls + rs) / 2 - (points[L_HIP] + points[R_HIP]) / 2))
    narrow = torso > 0 and float(np.linalg.norm(ls - rs)) / torso < 0.3
    if (face_share is not None and face_share < 0.12) or (abs(yaw) > 125 and (face_share is None or face_share < 0.3)):
        view = "orqa"
    elif 55 <= abs(yaw) <= 125 or narrow:
        view = "yon"
    else:
        view = "old"
    shoulder_y = min(ls[1], rs[1])
    arms_up = any(visibility[i] >= 0.5 and points[i][1] < shoulder_y for i in (L_WRIST, R_WRIST))
    return {"view": view, "yaw": round(yaw), "arms_up": bool(arms_up)}


def shading_map(rgb: np.ndarray, mask: np.ndarray, shoulder_px: float) -> np.ndarray:
    """
    Xonadagi yorug'lik (bir tomoni yorug', ikkinchisi soya): eski kiyimning keng yorug'lik xaritasi o'rtachasiga
    nisbatan. Yangi kiyim shunga ko'paytiriladi, katalog rasmidagi bir tekis yorug'lik "yopishtirilgan" ko'rinardi.
    """
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    total = float(mask.sum())
    if total < 50:
        return np.ones_like(lum)
    sigma = max(3.0, SHADE_SIGMA * shoulder_px)
    local = cv2.GaussianBlur(lum * mask, (0, 0), sigma) / (cv2.GaussianBlur(mask, (0, 0), sigma) + 1e-3)
    mean = float((lum * mask).sum()) / total
    shade = np.clip(local / max(mean, 1.0), *SHADE_RANGE) ** SHADE_STRENGTH
    return np.where(mask > 0.02, shade, 1.0).astype(np.float32)


def body_measure(
    raw: np.ndarray, visibility: np.ndarray, frame_size: tuple[int, int], smooth: np.ndarray, view: str = "old"
) -> dict:
    """
    O'lcham tavsiyasi uchun gavda nisbati: yelka kengligi / gavda uzunligi (yelka o'rtasidan son o'rtasigacha).
    Kamera masofani bilmaydi, shuning uchun santimetr emas, faqat nisbat beriladi: santimetrga sayt xaridor bo'yi
    bilan o'giradi. Yelka va sonlar aniq ko'rinmasa yoki odam yonboshlab tursa nisbat None.
    Belgilar uchun silliqlangan yelka va son nuqtalari (0..1, kadrga nisbatan) ham qaytadi. Yuz va teri tahlil qilinmaydi.
    """
    w, h = frame_size
    idx = [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP]
    pts = [[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in smooth[idx]]
    ratio = None
    # Yelka kengligi faqat old tomondan to'g'ri o'lchanadi
    if view == "old" and all(visibility[i] >= 0.6 for i in idx):
        shoulders = float(np.linalg.norm(raw[L_SHOULDER] - raw[R_SHOULDER]))
        torso = float(np.linalg.norm((raw[L_SHOULDER] + raw[R_SHOULDER]) / 2 - (raw[L_HIP] + raw[R_HIP]) / 2))
        # Odatdagi qiymat 0.6-0.9; chegaradan tashqarisi yonboshlab turish yoki poza xatosi
        if torso > 0 and 0.45 <= shoulders / torso <= 1.2:
            ratio = round(shoulders / torso, 4)
    return {"pts": pts, "r": ratio}


def compose_frame(frame: Image.Image, analysis: dict, infer, state: dict | None = None) -> np.ndarray:
    """
    Bitta kadr: niqob joriy kadrga suriladi (optik oqim), fon oqqa almashtiriladi, yuqori gavda kesiladi, model
    (infer) kesim o'lchamida natija beradi, xonadagi yorug'lik qo'shiladi, u joyiga qaytariladi va faqat kiyim niqobi
    ichida asl kadrga qo'yiladi. state (kadrlar orasida): odam qimirlamasa natija oldingisi bilan aralashtiriladi,
    model natijasidagi mayda titrash yo'qoladi; harakatda faqat yangi kadr. Natija: RGB uint8 massiv.
    """
    rgb = np.asarray(frame.convert("RGB"))
    h, w = rgb.shape[:2]
    analysis, motion = track_analysis(analysis, rgb)
    white = rgb.copy()
    white[analysis["bg"]] = 255
    x0, y0, x1, y1 = box = analysis["box"]
    crop = crop_white(white, box)
    person = cv2.resize(crop, SIZE, interpolation=cv2.INTER_AREA)
    # Natija kesim o'lchamida (ko'pi bilan HR_SIZE), kattaroq bo'lsa oxirida oddiy kattalashtiriladi
    bw, bh = x1 - x0, y1 - y0
    scale = min(1.0, HR_SIZE[0] / bw)
    up = infer(person, (max(SIZE[0], int(bw * scale)), max(SIZE[1], int(bh * scale))))
    if up.shape[:2] != (bh, bw):
        up = cv2.resize(up, (bw, bh), interpolation=cv2.INTER_CUBIC)
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    region = up[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0].astype(np.float32)
    m = analysis["soft"]
    pts = analysis["points"]
    shoulder_px = float(np.linalg.norm(pts[L_SHOULDER] - pts[R_SHOULDER]))
    region *= shading_map(rgb[sy0:sy1, sx0:sx1], m[sy0:sy1, sx0:sx1, 0], shoulder_px)[..., None]
    if state is not None:
        key = (analysis.get("garment"), analysis.get("view"), (sx0, sy0, sx1, sy1))
        prev = state.get("region")
        if prev is not None and state.get("key") == key and prev.shape == region.shape:
            # Qimirlamasa (harakat < 0.5 px) yarmi oldingi natija, 2 px dan ko'p harakatda faqat yangisi
            keep = 0.5 * float(np.clip((2.0 - motion) / 1.5, 0.0, 1.0))
            region = region * (1 - keep) + prev * keep
        state["region"], state["key"] = region, key
    layer = rgb.copy()
    layer[sy0:sy1, sx0:sx1] = region.clip(0, 255).astype(np.uint8)
    return (layer * m + rgb * (1 - m)).astype(np.uint8)


class MockMirror:
    """Modelsiz sinov (--mock): kiyim rasmi kesim markaziga qo'yiladi. Oqim, niqob va API'ni GPU'siz sinash uchun"""

    def __init__(self) -> None:
        self.garments: dict[str, np.ndarray] = {}

    def set_garment(self, garment_id: str, image: Image.Image, back: Image.Image | None = None) -> None:
        def prep(img: Image.Image) -> np.ndarray:
            cloth, edge = garment_inputs(img)
            return np.where(edge[..., None] > 0, cloth, 255).astype(np.uint8)

        plain = prep(plain_garment(image))
        self.garments[garment_id] = {"old": prep(image), "yon": plain, "orqa": prep(back) if back is not None else plain}

    def run(
        self, person: np.ndarray, garment_id: str, out_size: tuple[int, int] | None = None, view: str = "old"
    ) -> np.ndarray:
        out = person.copy()
        g = cv2.resize(self.garments[garment_id][view], (120, 160))
        sel = g.min(axis=2) < 250
        region = out[70:230, 36:156]
        region[sel] = g[sel]
        return cv2.resize(out, tuple(out_size), interpolation=cv2.INTER_CUBIC) if out_size else out


if __name__ == "__main__":
    # setup.bat: og'irliklarni yuklash (xato bo'lsa qo'lda yuklash ko'rsatmasi, traceback'siz)
    try:
        paths = ensure_weights(Path(__file__).resolve().parent / "models")
        print("Jonli oyna (DM-VTON): tayyor (" + ", ".join(p.name for p in paths.values()) + ")")
    except RuntimeError as e:
        print("DIQQAT: " + str(e))
        sys.exit(1)
