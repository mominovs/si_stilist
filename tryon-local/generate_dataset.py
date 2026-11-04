"""
O'qitish to'plamini rasm generatori (OpenAI GPT Image API) bilan avtomatik yig'ish (generate.bat, kunlik.bat).

Natija dataset_prep.py kutgan tuzilmada (README "O'qitish uchun ma'lumot yig'ish"):
    dataset/kiyimlar/<sku>_old.jpg              katalogdan (katalog buyrug'i)
    dataset/<ko'rinish>/gNNN/asosiy.jpg         sun'iy odam (odam buyrug'i), profil.json da tavsifi
    dataset/<ko'rinish>/gNNN/<sku>.jpg          o'sha surat, faqat ustki kiyim almashtirilgan (kiyintir buyrug'i)
    dataset/_xom/...                            generatorning tahrirlanmagan javobi (tekshirish uchun)
    dataset/_generatsiya.jsonl                  har so'rov: vaqt, model, fayl, token sarfi yoki xato

Buyruqlar:
    python generate_dataset.py katalog                      jonli oyna kiyimlari (futbolka, ko'ylak, sviter, kurtka)
    python generate_dataset.py odam --soni 3                yangi sun'iy odamlar (old/yon/orqa aralash)
    python generate_dataset.py kiyintir --limit 40          yetishmagan "odam x kiyim" rasmlari
    python generate_dataset.py kunlik --limit 60            kunlik tartib: kerak bo'lsa yangi odam, keyin kiyintirish
    python generate_dataset.py holat                        nechta odam, rasm, bugungi sarf

Generator tahrirda yuz, fon yoki kadrni ozgina o'zgartiradi: shuning uchun javob asosiy suratga tekislanadi (ECC) va
faqat ustki gavda atrofi asosiy suratga yopishtiriladi (--yopishtirma bilan o'chadi). Shunda kiyimdan tashqari hamma
narsa piksel-piksel bir xil bo'ladi va prep.bat juftlikni "yaxshi" deb baholaydi.

Kalit: OPENAI_API_KEY (muhit o'zgaruvchisi yoki loyiha ildizidagi .env). Kalit hech qayerga yozilmaydi.
Narx: platform.openai.com/usage da kuzating. Har ishga tushirish --limit dan ko'p rasm so'ramaydi.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import io
import json
import os
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

DEFAULT_MODEL = os.environ.get("DATASET_IMAGE_MODEL") or "gpt-image-2"
VIEWS = ("old", "yon", "orqa")
# Jonli oyna kiyimlari (src/lib/catalog.ts MIRROR_CATEGORIES): SKU boshlanishi bo'yicha
MIRROR_SKU = {"ft": "futbolka", "ky": "ko'ylak", "sv": "sviter", "kt": "kurtka"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}

# ---- Sun'iy odamlar: jonli oyna oldida odamlar qanday turadi ----
# Har profil tasodifiy birikma; urug' fayl nomidan, ya'ni qayta ishga tushirilsa bir xil chiqadi
PEOPLE = {
    "jins": ["young man", "young woman", "man", "woman", "teenage boy (18 years old)", "teenage girl (18 years old)",
             "middle-aged man", "middle-aged woman"],
    "kelib_chiqish": ["Uzbek", "Uzbek", "Uzbek", "Kazakh", "Tajik", "Russian", "Korean (Central Asian)", "Tatar"],
    "gavda": ["slim", "average build", "average build", "athletic", "stocky", "plus-size", "tall and thin", "short and broad-shouldered"],
    "soch": ["short dark hair", "black hair tied back", "long dark hair down over the shoulders", "curly hair",
             "buzz cut", "light brown hair in a bun", "wavy shoulder-length hair", "a neat headscarf covering the hair"],
    "boshlangich_kiyim": ["a plain grey crew-neck t-shirt", "a plain white t-shirt", "a plain black t-shirt",
                          "a simple navy long-sleeve top", "a plain beige sweatshirt", "a plain dark green t-shirt"],
    "pastki_kiyim": ["dark blue jeans", "black trousers", "beige chinos", "grey sweatpants", "a long dark skirt",
                     "light blue jeans"],
}
SCENES = [
    # (joy, kamera, yorug'lik) - jonli oyna: do'kondagi ekran/planshet yoki uyda telefon tokchada
    ("inside a clothing store, racks of clothes behind, a little out of focus", "a tablet camera on a stand at chest height, about 1.5 m away", "bright shop LED ceiling light"),
    ("in a shopping mall corridor near a shop entrance", "a kiosk screen camera at eye level, about 2 m away", "mixed mall lighting"),
    ("in a living room at home with a sofa and curtains", "a phone leaning on a shelf at chest height, about 1.5 m away", "warm evening lamp light"),
    ("in a bedroom with a wardrobe behind", "a phone on a tripod about 1.8 m away", "daylight from a window on one side"),
    ("in an office hallway with a plain wall", "a laptop webcam raised to chest height, about 1.2 m away", "cool fluorescent light"),
    ("in a small fitting room area with a curtain", "a front camera at eye level, about 1.2 m away", "soft overhead light, slightly yellow"),
    ("in front of a plain light-coloured wall", "a phone front camera held by a friend at chest height, about 1.5 m away", "even daylight"),
    ("in a university corridor", "a kiosk camera at eye level, about 2 m away", "dim indoor light with some noise"),
]
POSES = {
    "old": [
        "standing straight facing the camera, arms relaxed at the sides",
        "facing the camera, both hands in trouser pockets",
        "facing the camera, one hand on the hip",
        "facing the camera with the body turned about 20 degrees, arms relaxed",
        "facing the camera, arms slightly away from the body as if checking the fit",
        "facing the camera, holding a phone low in one hand at waist level",
        "facing the camera, one hand touching the collar",
        "facing the camera, weight on one leg, relaxed casual stance",
    ],
    "yon": [
        "turned about 45 degrees to the camera's left, looking at the camera",
        "turned about 45 degrees to the camera's right, arms relaxed",
        "standing in full side profile (90 degrees), arms relaxed",
        "turned about 60 degrees, looking over the shoulder at the camera",
    ],
    "orqa": [
        "standing with the back to the camera, arms relaxed",
        "back to the camera, head turned slightly to one side",
        "back to the camera, hands in trouser pockets",
    ],
}
FRAMING = ["from the head down to the knees", "from the head down to mid-thigh", "full body from head to shoes",
           "from the head down to the hips"]
VIEW_WEIGHTS = {"old": 0.6, "yon": 0.25, "orqa": 0.15}  # jonli oynada old tomon ko'p ishlatiladi

PERSON_PROMPT = """A realistic, unedited photo taken with {camera}. A {age_gender}, {origin}, {body}, with {hair}, \
{pose}, framed {framing}. They wear {top} and {bottom}. The person is {scene}, {light}. \
Ordinary everyday photo quality, natural skin texture, slight camera noise, no filters, no studio retouching, \
no text, no watermark, no logos on the clothes. The whole upper body and both arms are clearly visible and \
nothing covers the torso. Vertical 2:3 photo."""

EDIT_PROMPT = """Edit the first photo: replace only the upper-body garment the person is wearing{view_note} with the \
clothing item shown in the second image ({kind}). Keep everything else exactly identical: the same person, face, \
hair, skin, pose, hands, trousers, background, lighting, camera angle and framing. The new garment must match the \
second image exactly in color, pattern, collar, sleeves, buttons and any print, and fit naturally on this body with \
realistic folds and shadows{tuck}. Do not crop, zoom, mirror or move the camera. Output the same size and aspect \
ratio as the first photo."""
VIEW_NOTE = {"old": "", "yon": " (the person is turned to the side)", "orqa": " (the person is seen from the back)"}


def load_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        env = ROOT.parent / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.strip().startswith("OPENAI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key


def log(ds: Path, record: dict) -> None:
    record = {"vaqt": dt.datetime.now().isoformat(timespec="seconds"), **record}
    with (ds / "_generatsiya.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_log(ds: Path) -> list[dict]:
    p = ds / "_generatsiya.jsonl"
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def api_size(model: str, w: int, h: int) -> str:
    """Asosiy surat nisbatidagi o'lcham: gpt-image-2+ ixtiyoriy (16 ga karrali), eskilari faqat 3 standart"""
    if model.startswith(("gpt-image-2", "chatgpt-image")):
        scale = 1536 / max(w, h)
        r16 = lambda v: max(256, int(round(v * scale / 16)) * 16)  # noqa: E731
        return f"{r16(w)}x{r16(h)}"
    ratio = w / h
    return "1024x1536" if ratio < 0.85 else "1536x1024" if ratio > 1.18 else "1024x1024"


class Generator:
    """OpenAI so'rovlari: qayta urinish, sarfni yozish. --soxta: API'siz sinov (kiyim asosiy suratga taxminan qo'yiladi)"""

    def __init__(self, ds: Path, model: str, quality: str, fake: bool):
        self.ds, self.model, self.quality, self.fake = ds, model, quality, fake
        self.client = None
        if not fake:
            key = load_key()
            if not key:
                raise SystemExit("OPENAI_API_KEY topilmadi: .env ga OPENAI_API_KEY=... yozing (platform.openai.com/api-keys)")
            try:
                from openai import OpenAI
            except ImportError:
                raise SystemExit("openai paketi yo'q: generate.bat uni o'zi o'rnatadi (yoki pip install openai)")
            self.client = OpenAI(api_key=key, timeout=300, max_retries=2)

    def _call(self, kind: str, fn, out_name: str) -> bytes | None:
        import openai

        for attempt in range(4):
            try:
                t0 = time.time()
                resp = fn()
                data = base64.b64decode(resp.data[0].b64_json)
                usage = getattr(resp, "usage", None)
                log(self.ds, {"tur": kind, "model": self.model, "sifat": self.quality, "fayl": out_name,
                              "soniya": round(time.time() - t0, 1),
                              "token": usage.model_dump() if usage is not None else None})
                return data
            except openai.RateLimitError as e:
                if "quota" in str(e).lower() or "billing" in str(e).lower():
                    raise SystemExit("Balans tugadi yoki limit yo'q (platform.openai.com/settings/organization/billing)")
                wait = 30 * (attempt + 1)
                print(f"  limit: {wait} s kutiladi")
                time.sleep(wait)
            except openai.BadRequestError as e:
                # Ko'pincha xavfsizlik filtri: shu rasmni tashlab ketamiz (logda belgi, keyingi safar qayta so'ralmaydi)
                msg = str(e)[:300]
                print(f"  rad etildi: {msg}")
                log(self.ds, {"tur": kind, "model": self.model, "fayl": out_name, "xato": msg, "otkazish": True})
                return None
            except (openai.APIConnectionError, openai.APITimeoutError, openai.InternalServerError) as e:
                print(f"  tarmoq/server xatosi ({type(e).__name__}), qayta urinish")
                time.sleep(10 * (attempt + 1))
        log(self.ds, {"tur": kind, "model": self.model, "fayl": out_name, "xato": "4 urinishda ham bo'lmadi"})
        return None

    def person(self, prompt: str, out_name: str) -> bytes | None:
        if self.fake:
            return _fake_person()
        return self._call("odam", lambda: self.client.images.generate(
            model=self.model, prompt=prompt, size="1024x1536", quality=self.quality, output_format="jpeg", n=1),
            out_name)

    def edit(self, base: Path, garment: Path, prompt: str, out_name: str) -> bytes | None:
        if self.fake:
            return _fake_edit(base, garment)
        w, h = Image.open(base).size
        extra = {"input_fidelity": "high"} if self.model == "gpt-image-1.5" else {}

        def fn():
            with base.open("rb") as b, garment.open("rb") as g:
                return self.client.images.edit(model=self.model, image=[b, g], prompt=prompt, size=api_size(self.model, w, h),
                                               quality=self.quality, output_format="jpeg", n=1, **extra)
        return self._call("kiyintirish", fn, out_name)


def _fake_person() -> bytes:
    p = Path(os.environ.get("SOXTA_ODAM", ""))
    if not p.is_file():
        raise SystemExit("--soxta uchun SOXTA_ODAM=odam.jpg kerak")
    return p.read_bytes()


def _fake_edit(base: Path, garment: Path) -> bytes:
    """Sinov: kadr ozgina siljigan va yorug'ligi o'zgargan nusxa, ko'krakda kiyim rasmi (generator xatolarini taqlid)"""
    img = np.asarray(Image.open(base).convert("RGB")).astype(np.float32)
    h, w = img.shape[:2]
    m = np.float32([[1.01, 0, 6], [0, 1.01, -4]])
    img = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE) * 1.04
    g = np.asarray(Image.open(garment).convert("RGB").resize((w // 3, h // 4)))
    y, x = int(h * 0.45), int(w * 0.33)
    img[y:y + g.shape[0], x:x + g.shape[1]] = g
    buf = io.BytesIO()
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(buf, "JPEG", quality=92)
    return buf.getvalue()


# ---- Yopishtirish: javob asosiy suratga tekislanadi, faqat ustki gavda atrofi olinadi ----

class Compositor:
    def __init__(self):
        from masker import ClothMasker

        self.masker = ClothMasker(ROOT / "models")

    def region(self, img: np.ndarray, kind: str) -> tuple[np.ndarray, float] | None:
        from masker import PhotoError

        try:
            # kind=kurtka: niqob eng keng va uzun (etak sonning o'rtasigacha, siluetdan biroz chiqadi)
            mask, _, _, sw = self.masker.analyze(Image.fromarray(img), "tops", kind=kind)
        except PhotoError:
            return None
        return np.asarray(mask) > 127, float(sw)

    def __call__(self, base_path: Path, raw: bytes, kind: str) -> tuple[np.ndarray, dict]:
        from dataset_prep import align

        base = np.asarray(Image.open(base_path).convert("RGB"))
        h, w = base.shape[:2]
        edit = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))
        edit = cv2.resize(edit, (w, h), interpolation=cv2.INTER_AREA)
        rb = self.region(base, "kurtka")
        re_ = self.region(edit, "kurtka")
        if rb is None:
            return edit, {"yopishtirildi": False, "sabab": "asosiy suratda odam topilmadi"}
        mask, sw = rb
        if re_ is not None:
            mask = mask | re_[0]
        grow = max(3, int(sw * 0.12))
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))
        region = cv2.dilate(mask.astype(np.uint8), k)
        keep = ~cv2.dilate(region, np.ones((15, 15), np.uint8)).astype(bool)
        aligned, _, shift = align(base, edit, keep)
        # Tekislangandan keyin kiyim joyi qayta (javobdagi yangi kiyim shakli asosida)
        ra = self.region(aligned, "kurtka")
        if ra is not None:
            region = cv2.dilate((mask | ra[0]).astype(np.uint8), k)
        feather = max(3, grow // 2) | 1
        alpha = cv2.GaussianBlur(region.astype(np.float32), (0, 0), feather / 2)[..., None]
        out = base * (1 - alpha) + aligned * alpha
        outside = ~cv2.dilate(region, np.ones((9, 9), np.uint8)).astype(bool)
        drift = float(np.abs(aligned.astype(np.float32) - base)[outside].mean()) if outside.any() else 0.0
        return np.clip(out, 0, 255).astype(np.uint8), {"yopishtirildi": True, "siljish_px": round(shift, 1),
                                                       "tashqi_farq": round(drift, 1)}


# ---- Buyruqlar ----

def garments(ds: Path) -> dict[str, Path]:
    gdir = ds / "kiyimlar"
    if not gdir.exists():
        return {}
    out = {}
    for f in sorted(gdir.iterdir()):
        if f.suffix.lower() in IMAGE_EXT and f.stem.endswith("_old"):
            out[f.stem[:-4]] = f
    return out


def garment_kind(sku: str, ds: Path) -> str:
    meta = ds / "kiyimlar" / "turlar.json"
    if meta.exists():
        kinds = json.loads(meta.read_text(encoding="utf-8"))
        if sku in kinds:
            return kinds[sku]
    return MIRROR_SKU.get(sku.split("-")[0].lower(), "top")


def cmd_katalog(ds: Path, args) -> None:
    src = ROOT.parent / "public" / "products"
    gdir = ds / "kiyimlar"
    gdir.mkdir(parents=True, exist_ok=True)
    meta_p = gdir / "turlar.json"
    kinds = json.loads(meta_p.read_text(encoding="utf-8")) if meta_p.exists() else {}
    n = 0
    for f in sorted(src.iterdir()):
        prefix = f.stem.split("-")[0].lower()
        if f.suffix.lower() not in IMAGE_EXT or prefix not in MIRROR_SKU or f.stem.endswith("-orqa"):
            continue
        sku = f.stem.upper()
        dst = gdir / f"{sku}_old{f.suffix.lower()}"
        if not dst.exists():
            dst.write_bytes(f.read_bytes())
            n += 1
        back = f.with_name(f"{f.stem}-orqa{f.suffix}")
        if back.exists() and not (gdir / f"{sku}_orqa{f.suffix.lower()}").exists():
            (gdir / f"{sku}_orqa{f.suffix.lower()}").write_bytes(back.read_bytes())
        kinds[sku] = MIRROR_SKU[prefix]
    meta_p.write_text(json.dumps(kinds, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Kiyimlar: {n} ta yangi nusxalandi, jami {len(garments(ds))} ta ({gdir})")


def people(ds: Path) -> list[tuple[str, Path]]:
    out = []
    for view in VIEWS:
        vdir = ds / view
        if vdir.exists():
            for d in sorted(vdir.iterdir()):
                base = next((d / f"asosiy{e}" for e in (".jpg", ".jpeg", ".png", ".webp") if (d / f"asosiy{e}").exists()), None)
                if d.is_dir() and base:
                    out.append((view, base))
    return out


def next_person_id(ds: Path) -> int:
    # _yaroqsiz dagilar ham: raqam band bo'lsin (qayta urinishda bir xil profil chiqmasin)
    names = [d.name for v in VIEWS if (ds / v).exists() for d in (ds / v).iterdir() if d.is_dir()]
    if (ds / "_yaroqsiz").exists():
        names += [f.stem for f in (ds / "_yaroqsiz").iterdir()]
    used = [int(n[1:]) for n in names if n.startswith("g") and n[1:].isdigit()]
    return max(used, default=0) + 1


def make_profile(pid: int, view: str | None) -> dict:
    rnd = random.Random(pid * 7919)
    if view is None:
        view = rnd.choices(list(VIEW_WEIGHTS), weights=list(VIEW_WEIGHTS.values()))[0]
    scene = rnd.choice(SCENES)
    prof = {k: rnd.choice(v) for k, v in PEOPLE.items()}
    if "headscarf" in prof["soch"] and "woman" not in prof["jins"] and "girl" not in prof["jins"]:
        prof["soch"] = "short dark hair"
    prof.update(korinish=view, joy=scene[0], kamera=scene[1], yoruglik=scene[2], poza=rnd.choice(POSES[view]),
                kadr=rnd.choice(FRAMING if view == "old" else FRAMING[:3]))
    prof["prompt"] = PERSON_PROMPT.format(
        camera=prof["kamera"], age_gender=prof["jins"], origin=prof["kelib_chiqish"], body=prof["gavda"],
        hair=prof["soch"], pose=prof["poza"], framing=prof["kadr"], top=prof["boshlangich_kiyim"],
        bottom=prof["pastki_kiyim"], scene=prof["joy"], light=prof["yoruglik"])
    return prof


def cmd_odam(ds: Path, args, gen: Generator) -> int:
    made = 0
    comp = None
    for _ in range(args.soni):
        pid = next_person_id(ds)
        prof = make_profile(pid, args.korinish)
        pdir = ds / prof["korinish"] / f"g{pid:03d}"
        name = f"{prof['korinish']}/{pdir.name}/asosiy.jpg"
        print(f"Odam {name}: {prof['jins']}, {prof['gavda']}, {prof['poza']}")
        data = gen.person(prof["prompt"], name)
        if data is None:
            continue
        pdir.mkdir(parents=True, exist_ok=True)
        img = Image.open(io.BytesIO(data)).convert("RGB")
        # Odam aniq ko'rinmasa (yelkalar yo'q, juda yaqin) bu surat yaroqsiz: chetga olinadi
        comp = comp or Compositor()
        if comp.region(np.asarray(img), "kurtka") is None:
            bad = ds / "_yaroqsiz"
            bad.mkdir(exist_ok=True)
            img.save(bad / f"g{pid:03d}.jpg", quality=95)
            pdir.rmdir()
            print("  yaroqsiz (odam/yelka topilmadi): dataset/_yaroqsiz ga")
            continue
        img.save(pdir / "asosiy.jpg", quality=95)
        (pdir / "profil.json").write_text(json.dumps(prof, ensure_ascii=False, indent=1), encoding="utf-8")
        made += 1
    return made


def plan_edits(ds: Path, per_person: int) -> list[tuple[str, Path, str]]:
    """Yetishmagan (ko'rinish, asosiy surat, sku): avval rasmi kam odamlar, har odamga eng kam ishlatilgan kiyimlar"""
    gs = garments(ds)
    skip = {r["fayl"] for r in read_log(ds) if r.get("otkazish")}
    usage = {sku: 0 for sku in gs}
    rows = []
    for view, base in people(ds):
        have = {f.stem for f in base.parent.iterdir() if f.stem in gs}
        for sku in have:
            usage[sku] += 1
        rows.append((view, base, have))
    rows.sort(key=lambda r: len(r[2]))
    plan = []
    for view, base, have in rows:
        need = per_person - len(have)
        if need <= 0:
            continue
        # Orqa ko'rinishda orqa surati bor kiyimlar afzal
        cands = [s for s in gs if s not in have and f"{view}/{base.parent.name}/{s}.jpg" not in skip]
        rnd = random.Random(base.parent.name)
        rnd.shuffle(cands)
        cands.sort(key=lambda s: (usage[s], view == "orqa" and not _back(ds, s)))
        for sku in cands[:need]:
            usage[sku] += 1
            plan.append((view, base, sku))
    return plan


def _back(ds: Path, sku: str) -> Path | None:
    return next((p for e in IMAGE_EXT if (p := ds / "kiyimlar" / f"{sku}_orqa{e}").exists()), None)


def cmd_kiyintir(ds: Path, args, gen: Generator, limit: int) -> int:
    plan = plan_edits(ds, args.har_odam)
    if not plan:
        print("Kiyintirish uchun yangi ish yo'q (yangi odam qo'shing: odam --soni N)")
        return 0
    comp = None if args.yopishtirma else Compositor()
    done = 0
    for view, base, sku in plan[:limit]:
        kind = garment_kind(sku, ds)
        garment = (_back(ds, sku) if view == "orqa" else None) or garments(ds)[sku]
        name = f"{view}/{base.parent.name}/{sku}.jpg"
        tuck = "" if kind in ("kurtka", "sviter") else ", untucked unless the original top was tucked in"
        prompt = EDIT_PROMPT.format(view_note=VIEW_NOTE[view], kind=kind, tuck=tuck)
        print(f"Kiyintirish {name} ({kind})")
        data = gen.edit(base, garment, prompt, name)
        if data is None:
            continue
        raw_p = ds / "_xom" / name
        raw_p.parent.mkdir(parents=True, exist_ok=True)
        raw_p.write_bytes(data)
        if comp is None:
            Image.open(io.BytesIO(data)).convert("RGB").save(base.parent / f"{sku}.jpg", quality=95)
        else:
            img, info = comp(base, data, kind)
            Image.fromarray(img).save(base.parent / f"{sku}.jpg", quality=95)
            log(ds, {"tur": "yopishtirish", "fayl": name, **info})
            if info.get("yopishtirildi"):
                print(f"  tekislash {info['siljish_px']} px, kiyimdan tashqari farq (yopishtirishdan oldin) {info['tashqi_farq']}")
        done += 1
    return done


def today_count(ds: Path) -> int:
    today = dt.date.today().isoformat()
    return sum(1 for r in read_log(ds) if r.get("vaqt", "").startswith(today) and r.get("tur") in ("odam", "kiyintirish")
               and "xato" not in r)


def cmd_holat(ds: Path) -> None:
    ps = people(ds)
    gs = garments(ds)
    by_view = {v: 0 for v in VIEWS}
    edits = 0
    for view, base in ps:
        by_view[view] += 1
        edits += sum(1 for f in base.parent.iterdir() if f.stem in gs)
    log_ = read_log(ds)
    print(f"Kiyimlar: {len(gs)}")
    print(f"Odamlar: {len(ps)} (" + ", ".join(f"{v} {n}" for v, n in by_view.items()) + ")")
    print(f"Kiyintirilgan rasmlar: {edits}")
    print(f"Bugun so'ralgan rasm: {today_count(ds)}; jami so'rov: {sum(1 for r in log_ if r.get('tur') in ('odam', 'kiyintirish'))}, "
          f"rad etilgan: {sum(1 for r in log_ if r.get('otkazish'))}")
    tokens = [r["token"] for r in log_ if isinstance(r.get("token"), dict)]
    if tokens:
        out_tok = sum(t.get("output_tokens", 0) or 0 for t in tokens)
        in_tok = sum(t.get("input_tokens", 0) or 0 for t in tokens)
        print(f"Token: kirish {in_tok}, chiqish {out_tok} (narxni platform.openai.com/usage da ko'ring)")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("buyruq", choices=["katalog", "odam", "kiyintir", "kunlik", "holat"])
    p.add_argument("--dataset", default=str(ROOT / "dataset"))
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"standart {DEFAULT_MODEL} (DATASET_IMAGE_MODEL)")
    p.add_argument("--sifat", default="medium", choices=["low", "medium", "high", "xhigh", "max", "auto"])
    p.add_argument("--soni", type=int, default=1, help="odam: nechta yangi odam")
    p.add_argument("--korinish", choices=VIEWS, default=None, help="odam: faqat shu ko'rinish (standart aralash)")
    p.add_argument("--limit", type=int, default=40, help="bir ishga tushirishda ko'pi bilan shuncha rasm so'raladi")
    p.add_argument("--kunlik-limit", type=int, default=int(os.environ.get("DATASET_DAILY_LIMIT") or 150))
    p.add_argument("--har-odam", type=int, default=7, help="har odamga nechta kiyim (asosiy + 7 = 56 juftlik)")
    p.add_argument("--yopishtirma", action="store_true", help="generator javobini o'zgartirmay saqlash")
    p.add_argument("--soxta", action="store_true", help="API'siz sinov (SOXTA_ODAM=rasm.jpg)")
    args = p.parse_args()
    ds = Path(args.dataset)
    ds.mkdir(parents=True, exist_ok=True)

    if args.buyruq == "holat":
        cmd_holat(ds)
        return 0
    if args.buyruq == "katalog":
        cmd_katalog(ds, args)
        return 0

    left = max(0, args.kunlik_limit - today_count(ds))
    limit = min(args.limit, left)
    if limit <= 0:
        print(f"Bugungi limit ({args.kunlik_limit} rasm) tugagan. Ertaga yoki --kunlik-limit bilan.")
        return 0
    if not garments(ds):
        cmd_katalog(ds, args)
    gen = Generator(ds, args.model, args.sifat, args.soxta)

    if args.buyruq == "odam":
        cmd_odam(ds, argparse.Namespace(soni=min(args.soni, limit), korinish=args.korinish), gen)
    elif args.buyruq == "kiyintir":
        cmd_kiyintir(ds, args, gen, limit)
    else:  # kunlik: rejadagi ish limitdan kam bo'lsa yangi odamlar, qolgani kiyintirish
        pending = len(plan_edits(ds, args.har_odam))
        if pending < limit:
            new = max(1, (limit - pending) // (args.har_odam + 1))
            made = cmd_odam(ds, argparse.Namespace(soni=new, korinish=None), gen)
            limit -= new
            print(f"Yangi odam: {made}")
        n = cmd_kiyintir(ds, args, gen, limit)
        print(f"Kiyintirildi: {n}")
    cmd_holat(ds)
    return 0


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    os._exit(code)  # MediaPipe yopilishda keraksiz xato chiqarmasin
