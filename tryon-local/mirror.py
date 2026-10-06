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

# Poza nuqtalari (MediaPipe)
L_EYE, R_EYE, L_HIP, R_HIP = 2, 5, 23, 24


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


def garment_inputs(image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """
    Oq fondagi kiyim rasmi -> (kiyim 256x192x3 uint8, kontur 256x192 0/1). Kiyim kesib olinib, 3:4 nisbatda
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
    cloth = np.asarray(canvas.resize(SIZE, Image.BICUBIC))
    edge = (np.asarray(mcanvas.resize(SIZE, Image.NEAREST)) > 127).astype(np.float32)
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
        self.garments: dict[str, tuple] = {}

    def _tensor(self, arr: np.ndarray, normalize: bool = True):
        t = self.torch.from_numpy(np.ascontiguousarray(arr)).float()
        t = t.permute(2, 0, 1) / 255.0 if t.ndim == 3 else t[None]
        if normalize:
            t = t * 2 - 1
        return t[None].to(self.device)

    def set_garment(self, garment_id: str, image: Image.Image) -> None:
        cloth, edge = garment_inputs(image)
        clothes = self._tensor(cloth) * self.torch.from_numpy(edge).to(self.device)[None, None]
        self.garments[garment_id] = (clothes, self._tensor(edge, normalize=False))
        if len(self.garments) > 64:
            self.garments.pop(next(iter(self.garments)))

    def run(self, person: np.ndarray, garment_id: str) -> np.ndarray:
        """person: 256x192x3 uint8 (oq fonda) -> natija 256x192x3 uint8"""
        import torch.nn.functional as F

        clothes, edge = self.garments[garment_id]
        with self.torch.no_grad():
            img = self._tensor(person)
            warped_cloth, last_flow = self.warp(img, clothes)
            warped_edge = F.grid_sample(edge, last_flow.permute(0, 2, 3, 1), mode="bilinear",
                                        padding_mode="zeros", align_corners=True)
            out = self.gen(self.torch.cat([img, warped_cloth, warped_edge], 1))
            rendered, comp = self.torch.split(out, [3, 1], 1)
            rendered = self.torch.tanh(rendered)
            comp = self.torch.sigmoid(comp) * warped_edge
            tryon = warped_cloth * comp + rendered * (1 - comp)
        arr = ((tryon[0].permute(1, 2, 0).float().cpu().numpy() + 1) * 127.5).clip(0, 255)
        return arr.astype(np.uint8)


def compose_frame(
    frame: Image.Image,
    mask: Image.Image,
    background: np.ndarray,
    points: np.ndarray,
    infer,
) -> Image.Image:
    """
    Bitta kadr: fon oqqa almashtiriladi, yuqori gavda kesiladi, model (infer) ishlaydi, natija joyiga qaytariladi va
    faqat kiyim niqobi ichida asl kadrga yopishtiriladi.
    """
    rgb = np.asarray(frame.convert("RGB"))
    h, w = rgb.shape[:2]
    white = rgb.copy()
    white[background] = 255
    box = upper_body_box(points, (w, h))
    crop = crop_white(white, box)
    person = cv2.resize(crop, SIZE, interpolation=cv2.INTER_AREA)
    result = infer(person)
    x0, y0, x1, y1 = box
    up = cv2.resize(result, (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC)
    layer = rgb.copy()
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    layer[sy0:sy1, sx0:sx1] = up[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    # Niqob faqat kesim ichida amal qiladi; chegarasi yumshatiladi
    # Model kesimdagi fonni oq chizadi: niqobning fonga kirgan qismi olinmaydi (aks holda oq hoshiya chiqadi)
    m = (np.asarray(mask, dtype=np.float32) / 255.0) * (~background)
    inside = np.zeros_like(m)
    inside[sy0:sy1, sx0:sx1] = 1
    m = cv2.GaussianBlur(m * inside, (0, 0), max(1.5, w / 250))[..., None]
    return Image.fromarray((layer * m + rgb * (1 - m)).astype(np.uint8))


class MockMirror:
    """Modelsiz sinov (--mock): kiyim rasmi kesim markaziga qo'yiladi. Oqim, niqob va API'ni GPU'siz sinash uchun"""

    def __init__(self) -> None:
        self.garments: dict[str, np.ndarray] = {}

    def set_garment(self, garment_id: str, image: Image.Image) -> None:
        cloth, edge = garment_inputs(image)
        self.garments[garment_id] = np.where(edge[..., None] > 0, cloth, 255).astype(np.uint8)

    def run(self, person: np.ndarray, garment_id: str) -> np.ndarray:
        out = person.copy()
        g = cv2.resize(self.garments[garment_id], (120, 160))
        sel = g.min(axis=2) < 250
        region = out[70:230, 36:156]
        region[sel] = g[sel]
        return out


if __name__ == "__main__":
    # setup.bat: og'irliklarni yuklash (xato bo'lsa qo'lda yuklash ko'rsatmasi, traceback'siz)
    try:
        paths = ensure_weights(Path(__file__).resolve().parent / "models")
        print("Jonli oyna (DM-VTON): tayyor (" + ", ".join(p.name for p in paths.values()) + ")")
    except RuntimeError as e:
        print("DIQQAT: " + str(e))
        sys.exit(1)
