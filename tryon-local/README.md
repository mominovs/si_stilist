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
   O'tirgan odamda tizza va son (shim) ustki kiyim niqobidan chiqariladi.
3. **Odamga yaqinlashtirish**: model odam atrofidagi kesimni ishlaydi (uzoqdan olingan suratda kiyimga ko'proq
   piksel tushadi), natija esa asl surat o'lchamida (ko'pi bilan 1600 px) qaytariladi: yuz va fon tiniq qoladi.
4. **CatVTON faqat niqob ichini chizadi**, keyin natija asl suratga yumshoq chegara bilan qayta yopishtiriladi:
   yuz, qo'llar, fon pikselma-piksel o'zgarmaydi.

Avvalgi niqobsiz rejim butun suratni qayta chizardi: yaqin portretda yuzni "kesib" tashlar, galstuk va qo'llar
ustida artefakt qoldirardi. Kerak bo'lsa: `start.bat --mode maskfree`.

MediaPipe modellari (~15 MB) birinchi ishga tushishda `tryon-local/models/` ga yuklanadi.

## Jonli oyna (DM-VTON)

Saytdagi `/oyna` sahifasi: kamera ochiladi va tanlangan ustki kiyim (futbolka, ko'ylak, sviter, kurtka) real vaqtda
ko'rinadi. Model: [DM-VTON](https://github.com/KiseKloset/DM-VTON) (37 MB, 192x256, Tesla T4'da 40 kadr/s).
Kod mualliflar demosidan ([KiseKloset](https://github.com/KiseKloset/KiseKloset)) olinadi, og'irliklar
(`mobile_warp.pt`, `mobile_gen.pt`) Google Drive'dan `models/dmvton/` ga yuklanadi: ikkalasini ham `setup.bat` qiladi.
Asl kod `cupy` talab qiladi, bu yerda u oddiy PyTorch bilan almashtirilgan (`mirror.py`).

- Kadr: fon oqqa almashtiriladi, ko'zdan songacha kesiladi, model ishlaydi, natija faqat kiyim niqobi ichida asl
  kadrga qo'yiladi (yuz va fon o'zgarmaydi). Niqob (MediaPipe) fonda yangilanadi, kadr uni kutmaydi.
- Seans 60 soniya, keyin kamera o'chadi. "Sifatli surat" tugmasi joriy kadrni CatVTON bilan (~35 s) qayta chizadi.
- Jonli ko'rinish taxminiy: model old tomondan turgan odam va ustki kiyimda o'qitilgan. Belgacha, qo'llar yonda turing.
- Aylanish: server odam qaysi tomoni bilan turganini aniqlaydi (poza chuqurligi va yuz/soch). Yon va orqa
  tomonda kiyimning naqshsiz "tekis" varianti ishlatiladi (old tomondagi yozuv orqada chiqmasin). Do'konda orqa
  surati bo'lsa, `public/products/<sku>-orqa.jpg` (.png, .webp) qilib qo'ying: orqa tomonda o'sha ko'rinadi.
- Harakatda niqob optik oqim bilan tanaga ergashadi (kiyim orqada qolmaydi), turg'un turganda kadrlar silliqlanadi,
  xonadagi keng yorug'lik va soya yangi kiyimga o'tkaziladi. Qo'llar ko'tarilsa ekranda maslahat chiqadi.
- Oyna yuklanmasa (`/health` da `mirror: error`), rasm orqali kiyintirish ishlayveradi. O'chirish: `start.bat --no-mirror`.
- Google Drive ba'zan avtomatik yuklashni rad etadi ("Cannot retrieve the public link", kunlik limit). Unda
  `setup.bat` ikkinchi manbani sinaydi, bo'lmasa qo'lda: brauzerda
  [DM-VTON papkasi](https://drive.google.com/drive/folders/1wfWGsR0vWC5LrA26xhj92ec_GoCKV80A) dan
  `dmvton_pf_warp.pt` va `dmvton_pf_gen.pt` ni yuklab, `tryon-local\models\dmvton\` ga qo'ying (demo fayllari
  `mobile_warp.pt`/`mobile_gen.pt` ham bo'ladi). Ikkala manbadagi model ta'rifi kalit va o'lcham bo'yicha bir xil.
- Jonli kamera faqat shu kompyuterda (localhost) yoki HTTPS orqali ochiladi: telefondan sinash uchun saytni
  `npm run dev:https` bilan ishga tushiring (batafsil: asosiy README, "Demo kuni").

## Jonli oynani orqa/yon ko'rinish uchun o'qitish

DM-VTON faqat old tomonda o'qitilgan. Orqa (yoki yon) ko'rinish uchun o'z rasmlaringiz bilan qo'shimcha o'qitsa
bo'ladi. Natija alohida faylga yoziladi va faqat shu ko'rinishda ishlatiladi: old tomon modeli o'zgarmaydi.

1. Rasmlar (masalan, rasm generatorida yaratilgan):
   ```
   dataset/kiyimlar/k01_old.png, k01_orqa.png        oq fonda kiyim, old va orqa
   dataset/orqa/o01/asosiy.jpg                       odam orqasi bilan, istalgan kiyimda (faqat kirish)
   dataset/orqa/o01/k01.jpg, k02.jpg, ...            o'sha surat, faqat ustki kiyim almashtirilgan
   ```
   Bir odam papkasidagi rasmlarda poza, fon, shim va soch bir xil bo'lishi shart: faqat ustki kiyim o'zgaradi.
2. `prep.bat`: rasmlarni bir-biriga tekislaydi, niqob va pozani topadi, har juftlikni baholaydi.
   Natija: `dataset\hisobot.txt` va `dataset\hisobot.jpg` (yashil: yaxshi, sariq: o'rtacha, qizil: yaroqsiz).
3. `stop.bat` (GPU bo'shasin), keyin `train.bat --view orqa --steps 3000`. Har 200 qadamda `runs\orqa\` ga
   namuna rasm (kirish | kiyim | natija | maqsad) yoziladi. Kamida 3 odam bo'lsa, oxirgisi tekshiruv uchun
   ajratiladi va model faqat tekshiruvda yaxshilansa saqlanadi: `models\dmvton\orqa_warp.pt`, `orqa_gen.pt`.
4. `start.bat`: server yangi modelni o'zi topadi (`/health` da `mirror_models`). Yoqmasa, shu ikki faylni o'chiring.

Parametrlar: `--view orqa|yon`, `--steps`, `--batch` (standart 4), `--lr` (2e-5), `--faqat-yaxshi`,
`--val o03` (tekshiruv odami), `--no-vgg`.

## Sozlamalar

| Parametr | Standart | Izoh |
| --- | --- | --- |
| `--mode` | mask | `mask`: faqat kiyim qismi o'zgaradi (tavsiya). `maskfree`: eski niqobsiz model |
| `--preset` | orta | `tez` (768x576, 20 qadam), `orta` (768x576, 50), `sifat` (1024x768, 50). Masalan: `start.bat --preset sifat` |
| `--height --width` | presetdan | GPU xotirasi yetmasa: `start.bat --height 640 --width 480`. 8 GB+ bo'lsa: 1024 768 |
| `--steps` | presetdan | Kamroq: tezroq (20), ko'proq: sifatliroq (40-50) |
| `--no-mirror` | o'chiq | Jonli oyna (DM-VTON) yuklanmasin |
| `--safety` | o'chiq | NSFW filtri (+~1 GB GPU xotira) |
| `--port` | 8001 | O'zgartirsangiz, `.env` da `TRYON_LOCAL_URL` ni ham yangilang |

Kutish vaqti ilovada 120 s (`TRYON_TIMEOUT_MS`). Server ishlamasa yoki xato bersa, ilova "Demo rejim" ga o'tadi.

Natija bitta generatsiyada shakllanib boradi: 25%, 50%, 75% qadamlarda oraliq ko'rinish (`/tryon/stream`)
yuboriladi va saytda xiradan aniqqa silliq almashadi. RTX 3060 Laptop (6 GB) da 40 qadam ~30 s, `orta` (50 qadam)
taxminan 38 s. `sifat` rejimi 2 barobardan ko'proq
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
