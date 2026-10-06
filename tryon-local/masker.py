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
                output_category_mask=True,
            )
        )
        self.pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(paths["pose_landmarker_full.task"])),
                num_poses=1,
            )
        )

    def __call__(self, image: Image.Image, part: str = "tops") -> Image.Image:
        return self.analyze(image, part)[0]

    def analyze(self, image: Image.Image, part: str = "tops") -> tuple[Image.Image, tuple[int, int, int, int]]:
        """
        part: tops | bottoms | one-pieces.
        Qaytadi: L rejimdagi niqob (255 = almashtiriladi) va odamning chegarasi (x0, y0, x1, y1).
        """
        rgb = np.asarray(image.convert("RGB"))
        h, w = rgb.shape[:2]
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        seg = self.segmenter.segment(mp_image).category_mask.numpy_view().astype(np.uint8)
        if seg.shape != (h, w):
            seg = cv2.resize(seg, (w, h), interpolation=cv2.INTER_NEAREST)
        poses = self.pose.detect(mp_image).pose_landmarks
        if not poses:
            raise PhotoError("Suratda odam topilmadi. Kameraga qarab, belgacha yoki to'liq ko'rining.")
        lm = poses[0]

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

        def poly(points) -> None:
            cv2.fillPoly(region, [np.round(np.array(points)).astype(np.int32)], 255)

        def limb(a: int, b: int, radius: float, out: np.ndarray | None = None) -> None:
            cv2.line(region if out is None else out, tuple(int(v) for v in pt(a)), tuple(int(v) for v in pt(b)),
                     255, max(1, int(radius * 2)))

        if part == "bottoms":
            if not (visible(L_HIP, 0.3) or visible(R_HIP, 0.3)) or not (visible(L_KNEE, 0.3) or visible(R_KNEE, 0.3)):
                raise PhotoError("Shim yoki yubka uchun belingiz va tizzangiz ko'rinishi kerak. To'liq gavda bilan suratga tushing.")
            top = hip_mid - 0.25 * down
            poly([top + side * 0.75 * sw, top - side * 0.75 * sw, rh - side * 0.35 * sw, lh + side * 0.35 * sw])
            for a, b in ((L_HIP, L_KNEE), (R_HIP, R_KNEE), (L_KNEE, 27), (R_KNEE, 28)):
                limb(a, b, 0.32 * sw)
        else:
            # Tana: yelkadan biroz yuqori (yoqa, bo'yin) va kengroq, sondan biroz pastgacha (etak)
            up = -unit * 0.35 * sw
            bottom = 0.15 if part == "tops" else 0.0
            poly([
                ls + side * 0.2 * sw + up, rs - side * 0.2 * sw + up,
                rh - side * 0.3 * sw + down * bottom, lh + side * 0.3 * sw + down * bottom,
            ])
            # Qo'llar (yeng): yelka -> tirsak -> bilak
            for a, b in ((L_SHOULDER, L_ELBOW), (R_SHOULDER, R_ELBOW), (L_ELBOW, L_WRIST), (R_ELBOW, R_WRIST)):
                limb(a, b, 0.2 * sw)
            if part == "one-pieces":
                for a, b in ((L_HIP, L_KNEE), (R_HIP, R_KNEE), (L_KNEE, 27), (R_KNEE, 28)):
                    limb(a, b, 0.32 * sw)

        mask = ((clothes | skin) & (region > 0)).astype(np.uint8) * 255

        if part == "tops":
            # Oyoqlar (shim) ustki kiyimga kirmaydi: o'tirgan odamda tizza tana ichiga tushib qoladi
            legs = np.zeros((h, w), np.uint8)
            for a, b in ((L_HIP, L_KNEE), (R_HIP, R_KNEE)):
                if visible(b, 0.5):
                    knee, hip = pt(b), pt(a)
                    start = hip + (knee - hip) * 0.25
                    cv2.line(legs, tuple(int(v) for v in start), tuple(int(v) for v in knee), 255, int(0.7 * sw))
                    cv2.circle(legs, tuple(int(v) for v in knee), int(0.35 * sw), 255, -1)
            mask[legs > 0] = 0

        k = max(3, int(0.015 * max(h, w)))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k * 2 + 1, k * 2 + 1), np.uint8))
        mask = cv2.dilate(mask, np.ones((k, k), np.uint8))

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
        return Image.fromarray(mask), (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
