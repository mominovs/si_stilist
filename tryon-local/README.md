# Lokal virtual kiyintirish (CatVTON)

Internet va pullik API'siz, o'z kompyuteringizdagi NVIDIA GPU'da ishlaydigan kiyintirish serveri.
Xaridor surati kompyuterdan tashqariga chiqmaydi va diskka yozilmaydi.

Model: [CatVTON](https://github.com/Zheng-Chong/CatVTON) niqobsiz versiyasi
([zhengchong/CatVTON-MaskFree](https://huggingface.co/zhengchong/CatVTON-MaskFree)).
Litsenziya: CC BY-NC-SA 4.0, faqat notijorat foydalanish (BMI, tanlov, demo uchun mos).

## Talablar

- NVIDIA GPU, kamida 6 GB (RTX 3060 Laptop 6 GB uchun standart sozlamalar tanlangan)
- NVIDIA drayveri (yangi versiya), Windows 10/11
- Python 3.10 yoki 3.11 ([python.org](https://www.python.org/downloads/), o'rnatishda "Add to PATH" belgilansin)
- Git
- ~10 GB bo'sh joy (PyTorch ~2.5 GB, model ~4 GB)

## O'rnatish (bir marta)

```bat
cd tryon-local
setup.bat
```

Oxirida `CUDA: True NVIDIA GeForce RTX ...` chiqishi kerak. `False` chiqsa, NVIDIA drayverini yangilang.

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

## Sozlamalar

| Parametr | Standart | Izoh |
| --- | --- | --- |
| `--height --width` | 768 576 | GPU xotirasi yetmasa: `start.bat --height 640 --width 480`. 8 GB+ bo'lsa: 1024 768 |
| `--steps` | 30 | Kamroq: tezroq (20), ko'proq: sifatliroq (40-50) |
| `--safety` | o'chiq | NSFW filtri (+~1 GB GPU xotira) |
| `--port` | 8001 | O'zgartirsangiz, `.env` da `TRYON_LOCAL_URL` ni ham yangilang |

Kutish vaqti ilovada 120 s (`TRYON_TIMEOUT_MS`). Server ishlamasa yoki xato bersa, ilova "Demo rejim" ga o'tadi.

## Muammolar

- **`GPU xotirasi yetmadi`**: kichikroq o'lcham bilan ishga tushiring (`--height 640 --width 480`), boshqa
  GPU ishlatayotgan dasturlarni (o'yinlar, brauzerdagi og'ir sahifalar) yoping.
- **`CUDA topilmadi`**: NVIDIA drayverini yangilang, `setup.bat` ni qayta ishga tushiring.
- **Natija sifati past**: kiyim rasmlari oq fondagi haqiqiy suratlar bo'lsin (SVG siluetlar yomon natija beradi),
  odam to'g'ri turgan, yorug' joyda suratga olingan bo'lsin.
