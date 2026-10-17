"""
Kiyim niqobi: qaysi piksellar almashtiriladigan kiyim ekanini aniqlaydi (MediaPipe, CPU'da tez ishlaydi).

- Segmentatsiya (selfie_multiclass): fon, soch, tana terisi, yuz terisi, kiyim, aksessuar
- Poza (pose_landmarker): yelka, tirsak, bilak, son, tizza nuqtalari

Niqob faqat kiyim qismini qamraydi: yuz, soch va qo'llar (kaftlar) himoyalanadi, shuning uchun model ularni
o'zgartirmaydi. Surat yaroqsiz bo'lsa (odam yo'q, juda yaqin), tushunarli sabab bilan PhotoError tashlanadi.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

MODEL_URLS = {
    "selfie_multiclass_256x256.tflite": "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
    "selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    "pose_landmarker_full.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/latest/pose_landmarker_full.task",
}

# selfie_multiclass sinflari
BACKGROUND, HAIR, BODY_SKIN, FACE_SKIN, CLOTHES, OTHERS = range(6)

# Poza nuqtalari (MediaPipe Pose)
L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST = 11, 12, 13, 14, 15, 16
L_HIP, R_HIP, L_KNEE, R_KNEE = 23, 24, 25, 26


ARMS = ((L_SHOULDER, L_ELBOW), (R_SHOULDER, R_ELBOW), (L_ELBOW, L_WRIST), (R_ELBOW, R_WRIST))


# Ustki kiyim etagi: sondan qancha pastgacha (tana uzunligining ulushi). Kurtka va kostyum uzunroq
TOP_LENGTH = {"futbolka": 0.15, "ko'ylak": 0.18, "sviter": 0.22, "kostyum": 0.32, "kurtka": 0.38}
# Keng kiyim: eski kiyim siluetidan tashqariga (fonga) shuncha chiqishi mumkin (yelka kengligi ulushida). Tor
# kiyimda faqat ingichka chiziq: keng bo'shliqni model yorug' hoshiya bilan to'ldirib yuborardi
LOOSE = {"sviter": 0.08, "kostyum": 0.12, "kurtka": 0.16}
# Katalog rasmidagi bel kengligi odamda necha yelka kengligiga (MediaPipe yelka nuqtalari orasi) to'g'ri keladi.
# Do'kon suratlarida tajribada tanlangan: shunda tizzagacha libos tizzagacha, maksi to'pig'igacha chiziladi
WAIST_SW = 0.65


def garment_shape(image: Image.Image, kind: str | None = None) -> dict | None:
    """
    Katalog rasmidan (oq fon) libos yoki yubka shakli, bel kengligiga nisbatan: belidan etagigacha uzunligi
    (length) va etak kengligi (hem). Yubkada bel = yuqori chet, libosda = gavdaning eng tor joyi (tasma va yeng
    hisobga kirmaydi). Shunga qarab mini, midi, maksi va tor/keng etak chiziladi. Topilmasa None.
    """
    try:
        from mirror import garment_mask

        m = garment_mask(np.asarray(image.convert("RGB"))) > 0
    except Exception:  # noqa: BLE001 - shakl ixtiyoriy: odatiy uzunlik ishlatiladi
        return None
    rows = np.nonzero(m.any(axis=1))[0]
    if len(rows) < 20:
        return None
    y0, y1 = int(rows[0]), int(rows[-1]) + 1
    h = y1 - y0
    widths = np.array([np.ptp(np.nonzero(m[y])[0]) + 1 if m[y].any() else 0 for y in range(y0, y1)], np.float32)
    # Qatorlar bo'yicha silliqlash: tugma, burma kabi mayda narsalar o'lchovni buzmasin
    k = max(3, h // 40) | 1
    smooth = np.convolve(np.pad(widths, k // 2, mode="edge"), np.ones(k) / k, mode="valid")
    if kind == "yubka":
        waist = int(0.05 * h)
    else:
        lo, hi = int(0.22 * h), int(0.55 * h)
        waist = lo + int(np.argmin(smooth[lo:hi]))
    ww, hem = float(smooth[waist]), float(np.median(smooth[int(0.93 * h):]))
    if ww < 5:
        return None
    return {"length": (h - waist) / ww, "hem": hem / ww}


class PhotoError(Exception):
    """Surat kiyintirish uchun yaroqsiz: xabar xaridorga ko'rsatiladi."""


def ensure_models(models_dir: Path) -> dict[str, Path]:
    models_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, url in MODEL_URLS.items():
        path = models_dir / name
        if not path.exists():
            print(f"[masker] {name} yuklanmoqda...", flush=True)
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(url, tmp)
            tmp.rename(path)
        paths[name] = path
    return paths


class ClothMasker:
    def __init__(self, models_dir: Path):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        paths = ensure_models(models_dir)
        self.segmenter = vision.ImageSegmenter.create_from_options(
            vision.ImageSegmenterOptions(
                base_options=BaseOptions(model_asset_path=str(paths["selfie_multiclass_256x256.tflite"])),
                output_category_mask=False,
                output_confidence_masks=True,
            )
        )
        self.last_landmarks: np.ndarray | None = None
        # Har nuqtaning ishonchi (kadrdan tashqaridagilari 0): jonli oyna o'lchovi faqat aniq ko'ringan nuqtalardan
        self.last_visibility: np.ndarray | None = None
        # Jonli oyna: nuqtalar chuqurligi (z, x bilan bir xil masshtabda) va sinf xaritasi: odam qaysi tomoni bilan
        # turganini (old, yon, orqa) aniqlash uchun
        self.last_z: np.ndarray | None = None
        self.last_seg: np.ndarray | None = None
        self.pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(paths["pose_landmarker_full.task"])),
                num_poses=1,
            )
        )

    def __call__(self, image: Image.Image, part: str = "tops") -> Image.Image:
        return self.analyze(image, part)[0]

    def _segment(self, mp_image, h: int, w: int) -> np.ndarray:
        # Ishonch xaritalari silliq kattalashtirilib, keyin sinf tanlanadi: 256x256 dan zinapoyasiz aniq chegara
        conf = [m.numpy_view() for m in self.segmenter.segment(mp_image).confidence_masks]
        conf = np.stack([c if c.shape == (h, w) else cv2.resize(c, (w, h), interpolation=cv2.INTER_LINEAR) for c in conf])
        return conf.argmax(axis=0).astype(np.uint8)

    def segment(self, image: Image.Image) -> np.ndarray:
        """Har bir piksel sinfi (BACKGROUND, HAIR, ... ) asl o'lchamda."""
        rgb = np.ascontiguousarray(np.asarray(image.convert("RGB")))
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        return self._segment(mp_image, *rgb.shape[:2])

    def analyze(
        self, image: Image.Image, part: str = "tops", kind: str | None = None, shape: dict | None = None
    ) -> tuple[Image.Image, tuple[int, int, int, int], np.ndarray, float]:
        """
        part: tops | bottoms | one-pieces. kind: katalog kategoriyasi (kurtka, libos, yubka...), shape: garment_shape()
        natijasi. Ular bo'lsa niqob yangi kiyim shakliga moslanadi: uzun kurtka sondan pastgacha, libos va yubka
        oyoqlar orasidagi fonni ham qamraydi (aks holda yangi kiyim eski kiyim siluetiga "siqilib" qolardi).
        Qaytadi: L rejimdagi niqob (255 = almashtiriladi), odamning chegarasi (x0, y0, x1, y1), fon xaritasi
        va yelka kengligi (piksel, gavda o'lchami sifatida).
        """
        rgb = np.asarray(image.convert("RGB"))
        h, w = rgb.shape[:2]
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        seg = self._segment(mp_image, h, w)
        poses = self.pose.detect(mp_image).pose_landmarks
        if not poses:
            raise PhotoError("Suratda odam topilmadi. Kameraga qarab, belgacha yoki to'liq ko'rining.")
        lm = poses[0]
        # Oxirgi poza nuqtalari (piksel): jonli oyna yuqori gavda kesimini shundan oladi
        self.last_landmarks = np.array([[p.x * w, p.y * h] for p in lm], dtype=np.float32)
        self.last_z = np.array([p.z for p in lm], dtype=np.float32)
        self.last_seg = seg
        self.last_visibility = np.array(
            [getattr(p, "visibility", 1.0) if 0 <= p.x <= 1 and 0 <= p.y <= 1 else 0.0 for p in lm], dtype=np.float32
        )

        def visible(i: int, th: float = 0.5) -> bool:
            p = lm[i]
            return getattr(p, "visibility", 1.0) >= th and 0 <= p.x <= 1 and 0 <= p.y <= 1

        # Kadrdan tashqaridagi nuqtalar ham taxminiy koordinata bilan keladi: shakl qurishda ular ham ishlatiladi
        def pt(i: int) -> np.ndarray:
            return np.array([lm[i].x * w, lm[i].y * h], dtype=np.float32)

        face_ratio = float((seg == FACE_SKIN).mean())
        if face_ratio > 0.22:
            raise PhotoError("Kameraga juda yaqin turibsiz. Biroz uzoqlashing: yelka va belingiz ko'rinsin.")
        if not (visible(L_SHOULDER) or visible(R_SHOULDER)):
            raise PhotoError("Yelkalaringiz ko'rinmayapti. Kameradan uzoqroq turing, belgacha ko'rining.")

        ls, rs, lh, rh = pt(L_SHOULDER), pt(R_SHOULDER), pt(L_HIP), pt(R_HIP)
        sw = max(float(np.linalg.norm(ls - rs)), 0.15 * w)  # yelka kengligi: hamma o'lchamlar shunga nisbatan
        shoulder_mid, hip_mid = (ls + rs) / 2, (lh + rh) / 2
        down = hip_mid - shoulder_mid
        if np.linalg.norm(down) < 0.8 * sw:  # poza noaniq: tana uzunligini yelka kengligidan taxmin qilamiz
            down = np.array([0, 1.4 * sw], dtype=np.float32)
        unit = down / np.linalg.norm(down)
        side = np.array([-unit[1], unit[0]], dtype=np.float32)
        if np.dot(side, ls - rs) < 0:
            side = -side  # side: o'ng yelkadan chap yelkaga

        clothes = np.isin(seg, (CLOTHES, OTHERS))
        skin = seg == BODY_SKIN
        region = np.zeros((h, w), np.uint8)
        # Fon ham kiradigan hudud: yangi kiyim (yubka, libos etagi) eski kiyimdan kengroq bo'ladigan joy
        open_area = np.zeros((h, w), np.uint8)

        def poly(points, out: np.ndarray | None = None) -> None:
            cv2.fillPoly(region if out is None else out, [np.round(np.array(points)).astype(np.int32)], 255)

        def skirt(top_center: np.ndarray, top_half: float, length: float, hem_half: float) -> None:
            """Yuqoridan etakka kengayadigan trapetsiya (yubka, libos etagi): fon bilan birga"""
            hem = top_center + unit * length
            pts = [top_center + side * top_half, top_center - side * top_half, hem - side * hem_half, hem + side * hem_half]
            poly(pts)
            poly(pts, open_area)

        def limb(a: int, b: int, radius: float, out: np.ndarray | None = None) -> None:
            cv2.line(region if out is None else out, tuple(int(v) for v in pt(a)), tuple(int(v) for v in pt(b)),
                     255, max(1, int(radius * 2)))

        hip_half = 0.5 * float(np.linalg.norm(lh - rh)) + 0.35 * sw
        bottom = 0.0
        if part == "bottoms":
            if not (visible(L_HIP, 0.3) or visible(R_HIP, 0.3)) or not (visible(L_KNEE, 0.3) or visible(R_KNEE, 0.3)):
                raise PhotoError("Shim yoki yubka uchun belingiz va tizzangiz ko'rinishi kerak. To'liq gavda bilan suratga tushing.")
            top = hip_mid - 0.25 * down
            poly([top + side * 0.75 * sw, top - side * 0.75 * sw, rh - side * 0.35 * sw, lh + side * 0.35 * sw])
            if kind == "yubka":
                # Yubka oyoqlar orasini ham yopadi: uzunligi va etagi kiyim rasmidan (bel kengligiga nisbatan)
                length = float(np.clip((shape or {}).get("length", 1.6) * WAIST_SW, 0.6, 3.2)) * sw
                hem_half = float(np.clip(0.5 * (shape or {}).get("hem", 1.2) * WAIST_SW, 0.5, 1.5)) * sw
                skirt(top, hip_half, length, hem_half)
            else:
                for a, b in ((L_HIP, L_KNEE), (R_HIP, R_KNEE), (L_KNEE, 27), (R_KNEE, 28)):
                    limb(a, b, 0.32 * sw)
        else:
            # Tana: yelkadan biroz yuqori (yoqa, bo'yin) va kengroq, sondan biroz pastgacha (etak)
            up = -unit * 0.35 * sw
            if part == "tops":
                bottom = TOP_LENGTH.get(kind or "", 0.15)
            loose = LOOSE.get(kind or "", 0.0) if part == "tops" else 0.0
            poly([
                ls + side * 0.2 * sw + up, rs - side * 0.2 * sw + up,
                rh - side * (0.3 + loose) * sw + down * bottom, lh + side * (0.3 + loose) * sw + down * bottom,
            ])
            # Qo'llar (yeng): yelka -> tirsak -> bilak. Qalin kostyum yengi ham to'liq sig'sin
            for a, b in ARMS:
                limb(a, b, 0.3 * sw)
            if part == "one-pieces":
                # Libos etagi: beldan etakkacha trapetsiya, oyoqlar orasidagi fon ham (aks holda libos shimdek chiqadi).
                # Uzunlik va etak kengligi kiyim rasmidan, bel kengligiga nisbatan
                waist = shoulder_mid + 0.6 * down
                length = float(np.clip((shape or {}).get("length", 1.8) * WAIST_SW, 0.8, 4.0)) * sw
                hem_half = float(np.clip(0.5 * (shape or {}).get("hem", 1.4) * WAIST_SW, 0.55, 1.6)) * sw
                skirt(waist, hip_half, length, hem_half)

        mask = ((clothes | skin | (open_area > 0)) & (region > 0)).astype(np.uint8) * 255
        if part != "bottoms":
            # Qo'l o'qi bo'ylab ingichka chiziq sinfidan qat'i nazar niqobga kiradi: to'q yeng ba'zan fon deb
            # aniqlanadi va eski kiyimning yirtiq bo'laklari qolib ketardi
            core = np.zeros((h, w), np.uint8)
            for a, b in ARMS:
                if visible(b, 0.3):  # taxminiy (ko'rinmas) nuqtalar fon ustidan o'tib ketishi mumkin
                    limb(a, b, 0.1 * sw, out=core)
            mask[core > 0] = 255

        if part == "tops":
            # Oyoqlar (shim) ustki kiyimga kirmaydi: o'tirgan odamda tizza tana ichiga tushib qoladi
            legs = np.zeros((h, w), np.uint8)
            # Uzun kurtka etagi sonni qisman yopadi: oyoq chizig'i etakdan pastdan boshlanadi
            start_frac = max(0.25, bottom + 0.1)
            for a, b in ((L_HIP, L_KNEE), (R_HIP, R_KNEE)):
                if visible(b, 0.5):
                    knee, hip = pt(b), pt(a)
                    start = hip + (knee - hip) * start_frac
                    cv2.line(legs, tuple(int(v) for v in start), tuple(int(v) for v in knee), 255, int(0.7 * sw))
                    cv2.circle(legs, tuple(int(v) for v in knee), int(0.35 * sw), 255, -1)
            mask[legs > 0] = 0

        k = max(3, int(0.015 * max(h, w)))
        raw = mask
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k * 2 + 1, k * 2 + 1), np.uint8))
        mask = cv2.dilate(mask, np.ones((k, k), np.uint8))
        # Fonga faqat ingichka chiziq kiradi: keng bo'shliqni model yorug' hoshiya bilan to'ldirib yuboradi.
        # Keng kiyim (kurtka, sviter) uchun chiziq qalinroq, yubka/libos etagi esa butunlay ochiq
        band = max(3, k // 2, int(2 * LOOSE.get(kind or "", 0.0) * sw)) if part == "tops" else max(3, k // 2)
        near = cv2.dilate(raw, np.ones((band, band), np.uint8))
        mask[(seg == BACKGROUND) & (near == 0) & (open_area == 0)] = 0

        # Himoya: yuz va soch, kaftlarning esa faqat teri qismi (mato emas, aks holda kiyimda "teshik" qoladi)
        protect = np.isin(seg, (FACE_SKIN, HAIR)).astype(np.uint8) * 255
        protect = cv2.dilate(protect, np.ones((k, k), np.uint8))
        hands = np.zeros((h, w), np.uint8)
        for wrist, elbow in ((L_WRIST, L_ELBOW), (R_WRIST, R_ELBOW)):
            if visible(wrist, 0.3):
                wr, el = pt(wrist), pt(elbow)
                c = wr + 0.4 * (wr - el)  # kaft markazi bilakdan tirsakka teskari tomonda
                cv2.circle(hands, tuple(int(v) for v in c), int(0.28 * sw), 255, -1)
        hand_skin = ((hands > 0) & skin).astype(np.uint8) * 255
        protect |= cv2.dilate(hand_skin, np.ones((max(3, k // 2), max(3, k // 2)), np.uint8))
        mask[protect > 0] = 0

        if mask.mean() < 255 * 0.03:
            raise PhotoError("Kiyimingizni aniqlab bo'lmadi. Yorug'roq joyda, to'g'ri turib suratga tushing.")
        ys, xs = np.nonzero((seg != BACKGROUND) | (mask > 0))
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        return Image.fromarray(mask), box, seg == BACKGROUND, sw
