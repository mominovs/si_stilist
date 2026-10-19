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

## Jonli oynani qo'shimcha o'qitish (old, orqa, yon)

DM-VTON studiyadagi old tomon suratlarida o'qitilgan. Har ko'rinish (old, orqa, yon) uchun o'z rasmlaringiz bilan
alohida o'qitsa bo'ladi: natija `models\dmvton\<ko'rinish>_*.pt` ga yoziladi va faqat shu ko'rinishda ishlatiladi
(`old_*.pt` asl modelning o'rnini bosadi; o'chirsangiz asl model qaytadi). Saqlangan model bo'lsa o'qitish undan
davom etadi va yangisi faqat tekshiruvda undan yaxshi bo'lsa saqlanadi (`--toza`: asl modeldan boshlash).

Kiyim rasmlari jonli oynadagidek: old tomon `k01_old.png`; orqa tomon `k01_orqa.png` va naqshsiz variant aralash
(do'konda orqa surati bo'lmasa oyna naqshsiz variantni ishlatadi); yon tomon doim naqshsiz variant (`k01_yon.png`
kerak emas). Odam suratlari: `dataset/old/o01/...`, `dataset/yon/o01/...` (yon: 90° va 45° burilish).

1. Rasmlar (masalan, rasm generatorida yaratilgan):
   ```
   dataset/kiyimlar/k01_old.png, k01_orqa.png        oq fonda kiyim, old va orqa
   dataset/orqa/o01/asosiy.jpg                       odam orqasi bilan, istalgan kiyimda (faqat kirish)
   dataset/orqa/o01/k01.jpg, k02.jpg, ...            o'sha surat, faqat ustki kiyim almashtirilgan
   ```
   Bir odam papkasidagi rasmlarda poza, fon, shim va soch bir xil bo'lishi shart: faqat ustki kiyim o'zgaradi.
2. `prep.bat`: rasmlarni bir-biriga tekislaydi, niqob va pozani topadi, har juftlikni baholaydi.
   Natija: `dataset\hisobot.txt` va `dataset\hisobot.jpg` (yashil: yaxshi, sariq: o'rtacha, qizil: yaroqsiz).
3. `stop.bat` (GPU bo'shasin), keyin `train.bat --view orqa --steps 3000` (yoki `--view hammasi`). Har 200 qadamda `runs\orqa\` ga
   namuna rasm (kirish | kiyim | natija | maqsad) yoziladi. Kamida 3 odam bo'lsa, oxirgisi tekshiruv uchun
   ajratiladi va model faqat tekshiruvda yaxshilansa saqlanadi: `models\dmvton\orqa_warp.pt`, `orqa_gen.pt`.
4. `start.bat`: server yangi modelni o'zi topadi (`/health` da `mirror_models`). Yoqmasa, shu ikki faylni o'chiring.

Parametrlar: `--view old|orqa|yon|hammasi`, `--toza`, `--steps`, `--batch` (standart 4), `--lr` (2e-5), `--faqat-yaxshi`,
`--val o03` (tekshiruv odami), `--no-vgg`.

## O'qitish uchun ma'lumot yig'ish (ikkala rejim uchun bitta to'plam)

Bitta `dataset` papkasi bilan ham jonli oyna (`train.bat`), ham rasmli rejim (`train_photo.bat`) o'qitiladi. Eng katta
ta'sir ma'lumot sifatidan: kam, lekin toza rasm ko'p, lekin buzuq rasmdan yaxshi.

**Hajm.** Kamida 3 odam (biri tekshiruvga ajratiladi), yaxshisi 6-10 odam: yigit va qiz, har xil gavda, har xil
fon. Har odamga 5-8 kiyim. Bir odamning asosiy surati + 6 kiyim = 7 rasm = 36 juftlik.

**Kiyimlar.** Demoda ko'rsatiladigan do'kon kiyimlarining o'zi: shu kiyimlar eng yaxshi chiqadi. Ustki kiyimlar
(futbolka, ko'ylak, sviter, kurtka, kostyum): to'plamni tayyorlash hozircha faqat ustki kiyim niqobini yasaydi
(libos va yubka uchun emas). Katalog rasmini nusxalang: `public\products\<sku>.jpg` ->
`dataset\kiyimlar\<sku>_old.jpg` (orqa surati bo'lsa `<sku>_orqa.jpg`). Fayl nomida `_` faqat oxirida bo'lsin.

**Odam suratlari.** Har odam uchun bitta haqiqiy surat (`asosiy.jpg`): telefon yoki demo kamerasida, belgacha yoki
to'liq, qo'llar yonda, yorug' joy. Imkoni bo'lsa demo o'tkaziladigan joyda va kamerada oling: model aynan shu
sharoitni o'rganadi. Keyin rasm generatorida (ChatGPT) har kiyim uchun tahrir: `asosiy.jpg` va kiyim rasmini birga
yuklab, quyidagi prompt. Natijani kiyim nomi bilan saqlang: `dataset\old\o01\<sku>.jpg`.

```text
Edit the first photo: replace only the upper-body garment the person is wearing with the clothing item shown in
the second image. Keep everything else exactly identical: the same person, face, hair, pose, hands, trousers,
background, lighting, camera angle and framing. The new garment must match the second image exactly in color,
pattern, collar, sleeves, buttons and any print, and fit naturally on this body with realistic folds and shadows.
Do not crop, zoom, mirror or move the camera. Output the same size and aspect ratio as the first photo.
```

Orqa tomon uchun: odamning orqasidan olingan `asosiy.jpg`, kiyimning orqa surati va promptda "upper-body garment"
dan keyin "(the person is seen from the back)" qo'shing; natija `dataset\orqa\o01\<sku>.jpg`.

**Tekshirish.** `prep.bat` -> `dataset\hisobot.jpg`: qizil ramkali rasmni (yuz, soch, shim yoki fon o'zgargan,
poza siljigan) o'chiring yoki qayta yarating, keyin `prep.bat` ni qayta ishga tushiring. `kiyimlar_hisobot.jpg` da har
kiyim to'liq ko'rinishini tekshiring.

## Rasmli rejimni qo'shimcha o'qitish (CatVTON)

`train_photo.py` kiyimlarni o'z suratlaringizda "to'liq kiyilgandek" chizishni o'rgatadi: CatVTON'ning o'qitiladigan
qismi (self-attention, ~50 mln parametr) o'zgaradi, qolgan model muzlatilgan. 6 GB GPU uchun moslangan (bf16,
gradient checkpointing, latentlar oldindan hisoblanadi).

1. Ma'lumot (yuqoridagi bo'lim) va `prep.bat`.
2. `stop.bat` (GPU bo'shasin), keyin `train_photo.bat --steps 1500`. Terminalda har 20 qadamda yo'qotish va
   qadam vaqti chiqadi.
3. Har 250 qadamda `runs\photo\qadam_*.jpg`: har qator "kiyim joyi bo'yalgan surat | kiyim | natija | asl". Avval
   `qadam_00000.jpg` (o'qitishdan oldingi model) bilan solishtiring.
4. Kamida 3 odam bo'lsa model faqat tekshiruv odamida yaxshilansa `models\catvton_ft` ga saqlanadi. Odam kam bo'lsa
   natija `models\catvton_ft_sinov` ga yoziladi va server uni o'zi yuklamaydi: rasmlar yoqsa papkani `catvton_ft`
   deb qayta nomlang.
5. `start.bat`: server `models\catvton_ft` ni o'zi topadi (`/health` da `"photo_model": "o'qitilgan"`). Yoqmasa,
   papkani o'chiring: asl model qaytadi. Keyingi o'qitish saqlangan nusxadan davom etadi (`--toza`: asldan).

Parametrlar: `--steps` (1500), `--lr` (1e-5), `--height 768 --width 576` (sifatliroq; xotira yetmasa standart
512x384), `--batch` (1) va `--accum` (4), `--val o05` (tekshiruv odami), `--faqat-yaxshi`, `--every`, `--toza`.

Diqqat: odam kam bo'lsa model shu odamlarning yuzini "yodlab" qoladi; tekshiruv odami shuni ushlaydi. CatVTON litsenziyasi
notijorat (CC BY-NC-SA 4.0): o'qitilgan nusxa ham shunday.

Tartib: `prep.bat` -> `train_photo.bat` -> `train.bat --view hammasi` (jonli oyna, old tomon uchun ham kamida 3 odam).

## Kechasi o'qitish (bitta buyruq)

`kechasi.bat 8` (soat, standart 8): serverni to'xtatadi, `prep` qiladi, keyin vaqtning 70% ida rasmli rejimni
(768x576, xotira yetmasa o'zi 512x384 ga o'tadi), 30% ida jonli oynani (ma'lumoti bor har ko'rinish) o'qitadi.
O'qitish vaqt bo'yicha: LR avval isinadi, keyin kosinus bilan pasayadi; rasmli rejimda har misol oyna aksi bilan
ikki barobar (`--aks-yoq` o'chiradi). O'qitish davomida Windows uyquga ketmaydi (zaryadga ulang, qopqoqni yopmang).
Hammasi `runs\kechasi.log` ga yoziladi. Ertalab: log oxiri ("yaxshilandi, saqlandi" qatorlari), `runs\photo\` va
`runs\old\` dagi oxirgi rasmlar, keyin `start.bat`. Modellar faqat tekshiruv odamida yaxshilansa almashadi.
Alohida ham: `train_photo.bat --daqiqa 300`, `train.bat --view hammasi --daqiqa 120`.

## FLUX 3 Image Klein sinovi (ixtiyoriy)

Black Forest Labs'ning yangi (2026-yil oktyabr) ochiq modeli: 5,5 mlrd parametrli transformer, Qwen3-VL 4B matn
kodlovchi, bir nechta namuna rasm bilan tahrirlaydi ("birinchi rasmdagi odamga ikkinchi rasmdagi kiyimni kiydir").
Rasmiy minimal talab 8 GB GPU (INT8). Bu sinov 6 GB GPU uchun sozlangan va **sayt hamda serverga tegmaydi**:

1. Bir marta: `setup_flux.bat` (alohida `.venv-flux`: torch 2.7, diffusers dev). Model yopiq bo'lsa, oxirida
   chiqqan ko'rsatma bo'yicha Hugging Face'da litsenziyani qabul qilib, `hf auth login` qiling.
2. `start.bat` bilan server ishlab turgan bo'lsin (CatVTON natijalari ham olinadi), keyin `flux_sinov.bat`.
   Skript avval CatVTON natijalarini oladi, serverni to'xtatadi, keyin FLUX 3 ni ishga tushiradi.
3. `runs\flux3\taqqoslash.jpg`: har qatorda odam, kiyim, CatVTON, FLUX 3 va Gemini namunasi; `natija.txt`: har
   rasm vaqti va GPU xotirasi.

Sozlash: `--qadam 8` (tezroq; model 4-16 qadamga o'qitilgan, standart 12), `--mp 0.35` (kichikroq, tezroq),
`--odamlar o01,o10 --har-odam 4`, `--rasm surat.jpg --kiyim-fayl dataset\kiyimlar\ft-01_old.jpg` (o'z suratingiz),
`--offload` (xotira yetmasa), `--te gpu4bit` (kompyuterda 16 GB RAM bo'lmasa: matn kodlovchi GPU'da 4 bit).
Matn kodlovchi faqat birinchi marta ishlaydi, natijasi `models\flux3_kesh` da. Prompt upsampler (9B) ishlatilmaydi.

## Sozlamalar

| Parametr | Standart | Izoh |
| --- | --- | --- |
| `--mode` | mask | `mask`: faqat kiyim qismi o'zgaradi (tavsiya). `maskfree`: eski niqobsiz model |
| `--preset` | orta | `orta` (768x576, 50 qadam), `sifat` (1024x768, 50; 8 GB+ GPU uchun), `tez` (768x576, 20). `run-local.bat` da `TRYON_PRESET` bilan |
| `--height --width` | presetdan | GPU xotirasi yetmasa: `start.bat --height 640 --width 480`. 8 GB+ bo'lsa: 1024 768 |
| `--steps` | presetdan | Kamroq: tezroq (20), ko'proq: sifatliroq (40-50) |
| `--no-mirror` | o'chiq | Jonli oyna (DM-VTON) yuklanmasin |
| `--safety` | o'chiq | NSFW filtri (+~1 GB GPU xotira) |
| `--port` | 8001 | O'zgartirsangiz, `.env` da `TRYON_LOCAL_URL` ni ham yangilang |

Kutish vaqti ilovada 180 s (`TRYON_TIMEOUT_MS`). Server ishlamasa yoki xato bersa, ilova "Demo rejim" ga o'tadi.

Natija bitta generatsiyada shakllanib boradi: 25%, 50%, 75% qadamlarda oraliq ko'rinish (`/tryon/stream`)
yuboriladi va saytda xiradan aniqqa silliq almashadi. RTX 3060 Laptop (6 GB) da 40 qadam ~30 s, `orta` (50 qadam)
taxminan 38 s. `sifat` 1.8 barobar ko'p piksel ishlaydi. 6 GB GPU'da Windows xotirani umumiy (RAM) xotiraga
chiqaradi: xato bermaydi, lekin ~2 barobar sekin (sinovda 82 s) va jonli oyna ham sekinlashadi (kadr ~350 ms).
Haqiqiy OOM bo'lsa server o'zi `orta` ga o'tadi. Bir vaqtda navbat `TRYON_MAX_QUEUE` (standart 2, ortig'iga 429
"band" xabari). Jonli oyna bir vaqtda 2 seansga (`?s=` har seansning niqob keshi alohida).

## Sifatni oshirish (ta'siri bo'yicha)

1. **Haqiqiy kiyim suratlari.** SVG siluetlar bilan model rang va bichimni taxmin qiladi (masalan, polo o'rniga
   yoqali ko'ylak, to'q ko'k o'rniga ko'k). Oq fondagi haqiqiy surat: `public/products/<sku>.jpg` + `npm run images:apply`.
2. **`--preset sifat`** (1024x768): model shu o'lchamda o'qitilgan, tafsilotlar aniqroq (8 GB+ GPU).
   Niqob kiyim turiga moslanadi (sayt `kind` yuboradi): kurtka va kostyum uzunroq va kengroq, libos va yubka
   etagi uzunligi va kengligi kiyim rasmidan o'lchanadi, oyoqlar orasidagi fon ham qamraladi. Shuning uchun yangi
   kiyim eski kiyim siluetiga "siqilib" qolmaydi.
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
