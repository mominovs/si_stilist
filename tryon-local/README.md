# Lokal virtual kiyintirish (CatVTON)

Internet va pullik API'siz, o'z kompyuteringizdagi NVIDIA GPU'da ishlaydigan kiyintirish serveri.
Xaridor surati kompyuterdan tashqariga chiqmaydi va diskka yozilmaydi.

Model: [CatVTON](https://github.com/Zheng-Chong/CatVTON) niqobli versiyasi
([zhengchong/CatVTON](https://huggingface.co/zhengchong/CatVTON)) + [MediaPipe](https://ai.google.dev/edge/mediapipe)
kiyim niqobi. Litsenziya: CC BY-NC-SA 4.0, faqat notijorat foydalanish (BMI, tanlov, demo uchun mos).

## Talablar

- NVIDIA GPU, kamida 6 GB (RTX 3060 Laptop 6 GB uchun standart sozlamalar tanlangan)
- NVIDIA drayveri (yangi versiya), Windows 10/11
- Python **3.10, 3.11 yoki 3.12** (3.13 va undan yangisi ishlamaydi: PyTorch 2.4 ular uchun chiqmagan).
  Tavsiya: [Python 3.11.9](https://www.python.org/downloads/release/python-3119/) "Windows installer (64-bit)",
  o'rnatishda "py launcher" belgilansin. Kompyuterdagi yangi Python'ga tegmaydi, `setup.bat` 3.11 ni o'zi topadi
- Git
- ~12 GB bo'sh joy (PyTorch ~2.5 GB, model ~4-5 GB)

## O'rnatish (bir marta)

```bat
cd tryon-local
setup.bat
```

Oxirida `CUDA: True NVIDIA GeForce RTX ...` va `MediaPipe (kiyim niqobi): 1.0.1` chiqishi kerak. `False` chiqsa, NVIDIA drayverini yangilang.
`setup.bat` mos Python'ni o'zi tanlaydi va noto'g'ri versiya bilan yaratilgan eski `.venv` ni qayta yaratadi.

## Ishga tushirish

1. Lokal serverni alohida oynada ishga tushiring:
   ```bat
   cd tryon-local
   start.bat
   ```
   Birinchi marta model yuklab olinadi (~4 GB, bir necha daqiqa). `[model] tayyor` yozuvi chiqishini kuting.
2. Loyiha ildizidagi `.env` ga qo'shing:
   ```
   TRYON_PROVIDER=local
   ```
3. Tekshirish: `npm run check:tryon -- men.jpg` (natija `tryon-test.jpg` ga yoziladi), keyin `npm run dev`.

## Qanday ishlaydi: niqobli rejim

1. **Surat tekshiruvi** (MediaPipe, CPU'da ~0.1 s): odam topilmasa, yelkalar ko'rinmasa yoki yuz kadrning katta
   qismini egallasa (juda yaqin), surat GPU'ga yuborilmay rad etiladi. Saytda sabab va "Qayta suratga tushish"
   tugmasi chiqadi (demo rejim emas).
2. **Kiyim niqobi**: segmentatsiya (kiyim, teri, yuz, soch) + poza (yelka, bilak, son) bo'yicha faqat almashtiriladigan
   kiyim qismi belgilanadi. Yuz, soch va kaftlar himoyalanadi. Shim/yubka uchun beldan pasti, libos uchun butun gavda.
3. **CatVTON faqat niqob ichini chizadi**, keyin natija asl suratga yumshoq chegara bilan qayta yopishtiriladi:
   yuz, qo'llar, fon pikselma-piksel o'zgarmaydi.

Avvalgi niqobsiz rejim butun suratni qayta chizardi: yaqin portretda yuzni "kesib" tashlar, galstuk va qo'llar
ustida artefakt qoldirardi. Kerak bo'lsa: `start.bat --mode maskfree`.

MediaPipe modellari (~15 MB) birinchi ishga tushishda `tryon-local/models/` ga yuklanadi.

## Sozlamalar

| Parametr | Standart | Izoh |
| --- | --- | --- |
| `--mode` | mask | `mask`: faqat kiyim qismi o'zgaradi (tavsiya). `maskfree`: eski niqobsiz model |
| `--preset` | orta | `tez` (768x576, 20 qadam), `orta` (768x576, 40), `sifat` (1024x768, 50). Masalan: `start.bat --preset sifat` |
| `--height --width` | presetdan | GPU xotirasi yetmasa: `start.bat --height 640 --width 480`. 8 GB+ bo'lsa: 1024 768 |
| `--steps` | presetdan | Kamroq: tezroq (20), ko'proq: sifatliroq (40-50) |
| `--safety` | o'chiq | NSFW filtri (+~1 GB GPU xotira) |
| `--port` | 8001 | O'zgartirsangiz, `.env` da `TRYON_LOCAL_URL` ni ham yangilang |

Kutish vaqti ilovada 120 s (`TRYON_TIMEOUT_MS`). Server ishlamasa yoki xato bersa, ilova "Demo rejim" ga o'tadi.

Natija bitta generatsiyada shakllanib boradi: 25%, 50%, 75% qadamlarda oraliq ko'rinish (`/tryon/stream`)
yuboriladi va saytda xiradan aniqqa silliq almashadi. RTX 3060 Laptop (6 GB) da 30 qadam ~20 s edi, `orta` (40 qadam)
taxminan 27 s bo'lishi kutiladi. `sifat` rejimi 2 barobardan ko'proq
piksel ishlaydi, shuning uchun sekinroq va GPU xotirasi yetmasligi mumkin; yetmasa `orta` ga qayting.

## Sifatni oshirish (ta'siri bo'yicha)

1. **Haqiqiy kiyim suratlari.** SVG siluetlar bilan model rang va bichimni taxmin qiladi (masalan, polo o'rniga
   yoqali ko'ylak, to'q ko'k o'rniga ko'k). Oq fondagi haqiqiy surat: `public/products/<sku>.jpg` + `npm run images:apply`.
2. **`--preset sifat`** (1024x768): model shu o'lchamda o'qitilgan, tafsilotlar aniqroq.
3. **Yaxshi surat:** old tomondan, yorug', oddiy fon, qo'llar yon tomonda, belgacha yoki to'liq gavda.

## Muammolar

- **"Kameraga juda yaqin turibsiz" / "Yelkalaringiz ko'rinmayapti"**: surat tekshiruvi. 1-1.5 metr uzoqlashing,
  belgacha ko'rining. Shim va yubka uchun tizzagacha ko'rinish kerak.
- **`mediapipe o'rnatilmagan`**: `git pull` dan keyin `setup.bat` ni qayta ishga tushiring.

- **`8001-port band`**: eski server fonda ishlab qolgan. `stop.bat`, keyin `start.bat`.
- **`No matching distribution found for torch==2.4.0`**: Python versiyasi mos emas (3.13+). Python 3.11 ni
  o'rnatib, `setup.bat` ni qayta ishga tushiring.
- **`GPU xotirasi yetmadi`**: kichikroq o'lcham bilan ishga tushiring (`--height 640 --width 480`), boshqa
  GPU ishlatayotgan dasturlarni (o'yinlar, brauzerdagi og'ir sahifalar) yoping.
- **`CUDA topilmadi`**: NVIDIA drayverini yangilang, `setup.bat` ni qayta ishga tushiring.
- **Natija sifati past**: kiyim rasmlari oq fondagi haqiqiy suratlar bo'lsin (SVG siluetlar yomon natija beradi),
  odam to'g'ri turgan, yorug' joyda suratga olingan bo'lsin.
