# Loyiha: SI Stilist — kiyim do'konlari uchun SI stilist va talab analitikasi

## Kontekst
Bu universitet startap tanlovi uchun loyiha. Maqsad: hakamlar oldida jonli ishlaydigan demo.
Ishonchlilik va tushunarlilik murakkablikdan muhimroq.

G'oya ikki tomonlama:
1. Xaridor uchun: o'zbek tilida erkin so'rov yozadi. Tizim do'kon omborida BOR tovarlardan
   3 ta mos variantni o'lchamlari bilan taklif qiladi. Xaridor suratga tushib, tanlagan kiyimni
   o'zida ko'radi (virtual kiyintirish).
2. Do'kon uchun: har bir so'rov saqlanadi. Panelda eng ko'p so'ralgan kategoriya, uslub va ranglar
   hamda "qoniqtirilmagan talab" (so'ralgan, lekin omborda yo'q tovarlar) ko'rsatiladi.

Asosiy farqlovchi qism: qoniqtirilmagan talab analitikasi. Virtual kiyintirish tayyor API orqali qilinadi.

## Arxitektura tamoyili (muhim)
AI faqat ikki joyda ishlatiladi:
- So'rovni tushunish: LLM xaridor matnini tartibli JSON'ga aylantiradi. Tovar tanlashni LLM QILMAYDI.
- Virtual kiyintirish: tashqi try-on API.
Qolgan hamma narsa oddiy, deterministik kod bilan qilinadi: SQL filtrlash, ball berish, statistika.
Natija hech qachon omborda yo'q tovarni "o'ylab topmasligi" kerak.
Kamera orqali tashqi ko'rinish yoki teri tusi tahlili bu versiyada YO'Q.

## Texnologiyalar
- Next.js (App Router, TypeScript): frontend va API bitta loyihada
- PostgreSQL (Prisma yoki oddiy SQL, qaysi biri qulayligini taklif qil)
- LLM: Claude API, model `claude-haiku-4-5-20251001`. Modelni almashtirish oson bo'lsin
- Rasm orqali kiyintirish: fal.ai (masalan `fal-ai/kling/v1-5/kolors-virtual-try-on` yoki FASHN).
  Endpoint konfiguratsiyada saqlansin
- Real vaqtli kiyintirish (oxirgi bosqich): Decart `lucy-2.1-vton` (@decartai/sdk, WebRTC)
- Barcha API kalitlar faqat serverda (.env) turadi, brauzerga chiqmaydi
- Integratsiyadan oldin fal.ai va Decart'ning joriy hujjatlarini tekshir, chunki API'lar o'zgarishi mumkin

## Ma'lumotlar modeli (taklif, yaxshilasang bo'ladi)
- products: id, nomi, kategoriya, jins, rang, uslub teglari (ish, kundalik, bayram, sport...),
  mavsum, narx, rasm_url (oq fondagi kiyim rasmi)
- product_variants: product_id, o'lcham, qoldiq
- requests: id, vaqt, xom matn, parse qilingan JSON, natijalar soni,
  holat (qoniqtirildi / qisman / qoniqtirilmadi)
- request_results: request_id, product_id, o'rin
- Xaridor rasmlari SAQLANMAYDI

## LLM parsing
Kirish: o'zbekcha (lotin yoki kirill) yoki ruscha erkin matn. Chiqish: faqat JSON.
```json
{
  "kategoriya": string|null, "jins": "erkak"|"ayol"|null,
  "ranglar": [], "rang_istisno": [], "uslub": [], "maqsad": string|null,
  "narx_darajasi": "arzon"|"orta"|"qimmat"|null, "olcham": string|null,
  "mavsum": string|null, "izoh": string
}
```
- Mavjud kategoriya va ranglar ro'yxati bazadan olinib promptga qo'yiladi. Bazada yo'q kategoriya
  so'ralsa ham, u albatta saqlanadi, chunki aynan shu qoniqtirilmagan talab hisoblanadi.
- JSON zod bilan tekshiriladi. Xato bo'lsa bir marta qayta urinadi, keyin filtr tugmalariga qaytadi.
- Misol: "Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum kerak" →
  `{"kategoriya":"kostyum","rang_istisno":["qora"],"maqsad":"ish","narx_darajasi":"orta",...}`

## Moslashtirish qoidalari
- Qattiq filtrlar: kategoriya, jins, rang_istisno, qoldiq > 0
- Yumshoq ball: uslub/maqsad, rang, narx darajasi, mavsum
- Narx darajasi: har bir kategoriya ichida narx bo'yicha uchga bo'linadi (arzon / o'rta / qimmat)
- Eng yaxshi 3 ta natija chiqariladi. Aniq mos tovar kam bo'lsa, yaqin variantlar
  "Shu rangda yo'q, o'xshashi bor" belgisi bilan qo'shiladi
- Holat: 0 natija bo'lsa "qoniqtirilmadi", faqat yaqin variantlar bo'lsa "qisman"

## Ekranlar (interfeys tili: o'zbek, lotin)
1. Xaridor ekrani (planshet yoki katta ekran uchun): chat maydoni va 3 ta kartochka
   (rasm, narx, mavjud o'lchamlar, "Omborda bor" / "O'xshashi bor" belgisi), "O'zimda ko'rish" tugmasi
2. Kiyintirish: rozilik ekrani, kamera orqali surat, natija rasmi.
   Surat faqat API'ga yuboriladi va saqlanmaydi
3. Do'kon paneli: eng ko'p so'ralgan kategoriya va uslublar, mashhur ranglar, qoniqtirilmagan
   talab ro'yxati (so'rovlar soni bo'yicha). Yangi so'rov kelganda panel jonli yangilansin,
   bu demo uchun muhim
4. Admin: tovar qo'shish va tahrirlash, CSV import (keyinchalik real do'kon ma'lumoti uchun)

## Demo ishonchliligi
- LLM yoki internet ishlamasa, filtr tugmalari (kategoriya, rang, narx) zaxira rejimida ishlaydi
- Try-on API xato bersa yoki sekinlashsa, oldindan tayyorlangan natijalar ko'rsatiladi
  ("demo rejim" deb aniq belgilanadi)
- Real vaqt seansiga maksimal davomiylik (masalan, 60 soniya) va avtomatik to'xtash qo'yiladi,
  chunki xarajat har sekund uchun hisoblanadi
- Seed ma'lumot: 40–60 ta tovar, har biri oq fonda aniq rasm bilan

## Bosqichlar (shu tartibda ishlaymiz)
1. Loyiha skeleti, baza sxemasi, seed ma'lumot, admin
2. LLM parsing, moslashtirish, xaridor ekrani
3. So'rovlar logi va do'kon paneli (qoniqtirilmagan talab)
4. Rasm orqali virtual kiyintirish (fal.ai)
5. Zaxira rejimlar va demo sayqali
6. Real vaqtli oyna rejimi (Decart), alohida sahifa sifatida

Har bosqich oxirida loyiha ishlaydigan holatda bo'lsin.
Birinchi qadam: 1-bosqich rejasini va papka tuzilmasini taklif qil.
Men tasdiqlaganimdan keyin kod yozishni boshla.

## Texnik eslatmalar (1-bosqichdan keyin)
- Next.js 16: `middleware` o'rniga `src/proxy.ts`; `params`/`searchParams` Promise. Kod yozishdan oldin
  `node_modules/next/dist/docs/` ni tekshir (batafsil: AGENTS.md)
- Prisma 7: klient `src/generated/prisma` ga generatsiya qilinadi (`@/generated/prisma/client`),
  `@prisma/adapter-pg` orqali ulanadi, sozlama `prisma.config.ts` da. `migrate dev` klientni avtomatik
  generatsiya qilmaydi: `npx prisma generate`
- Katalog lug'ati (kategoriya, rang, uslub, mavsum): `src/lib/catalog.ts`
- Tashqi xizmat sozlamalari (model, endpoint): `src/lib/config.ts`
- Seed: `prisma/seed-data/products.ts` (48 tovar, deterministik qoldiq; krossovka/palto/sumka ataylab yo'q)

## Texnik eslatmalar (2-bosqichdan keyin)
- So'rovni tushunish zanjiri `src/lib/query/index.ts`: LLM (`llm.ts`, `messages.parse` + zod, 12 s + 8 s timeout,
  1 marta qayta urinish) -> kalit so'z tahlilchisi (`keywords.ts`, LLM/internet ishlamasa) -> `tushunilmadi`
  (interfeys filtr tugmalarini ochadi). Natija `normalize.ts` da bazadagi qiymatlarga moslanadi
- Moslashtirish: `src/lib/matching.ts` (toza funksiya). Qidiruv + so'rovni logga yozish: `src/lib/search.ts`,
  API: `POST /api/search` (`{text}` yoki `{filters}`)
- Request.mode: `llm` | `kalit` | `filtr` | `tushunilmadi`
- Xaridor sahifasi ochilganda `after()` orqali LLM "isitiladi" (10 daqiqada 1 marta), SI holati sarlavhada ko'rinadi
- Testlar: `npm test` (node:test + tsx), seed ombori ustida moslashtirish testlari bor
- Himoya: LLM javobida `mavzu` ("kiyim" | "boshqa"); "boshqa" -> mode `rad`, tovar qidirilmaydi. Mezonsiz
  so'rov -> `tushunilmadi`. Xaridor matni `<xaridor_sorovi>` ichida ma'lumot sifatida beriladi; LLM maydonlari
  `normalize.ts` da tozalanadi (belgilar, uzunlik). `/api/search`: 20 so'rov/daqiqa/IP, SI kunlik limiti
  `LLM_DAILY_LIMIT` (standart 500)

## Texnik eslatmalar (3-bosqichdan keyin)
- Do'kon paneli: `/panel` (Basic Auth, admin paroli). Statistika `src/lib/analytics.ts` dagi toza
  `computeStats` funksiyasida (testlar bor), yuklash `src/lib/panel.ts`, API `GET /api/panel?period=`
- Jonli yangilanish: har 2 s polling (serverless'da ham ishlaydi). Yangi so'rovlar va o'sgan talab qatorlari
  4 s ajratib ko'rsatiladi. `POST /api/panel/reset` logni tozalaydi
- Qoniqtirilmagan talab kaliti: kategoriya + ranglar. Turi: `katalogda-yoq` | `tugagan` | `oxshashi-bor`.
  Mavzudan tashqari (`rad`) so'rovlar holat statistikasiga kirmaydi
- Seed 56 ta namunaviy so'rov yaratadi (`mode: "namuna"`, `prisma/seed-data/requests.ts`), holati haqiqiy
  moslashtirish bilan hisoblanadi
- `src/lib/db.ts`: Prisma klienti jarayon bo'yicha yagona; `prisma dev` (port 5121x) bilan havza = 1 ulanish,
  aks holda parallel so'rovlarda "Connection terminated unexpectedly". `DATABASE_POOL_MAX` bilan o'zgartiriladi

## Texnik eslatmalar (4-bosqichdan keyin)
- Virtual kiyintirish: `src/lib/tryon/` (`garment.ts` SVG/rasm -> 768x1024 PNG, sharp; `gemini.ts` Google
  Gemini rasm modeli `TRYON_GEMINI_MODEL` (standart `gemini-3.1-flash-image`); `fal.ts` adapterlar: Kolors, FASHN;
  `index.ts` provayder tanlash + zaxira mantiqi), API `POST /api/tryon` `{productId, photo: dataURL}`
- Provayder: `TRYON_PROVIDER` yoki avtomatik (`GEMINI_API_KEY` bo'lsa Gemini, aks holda fal). Gemini rasm
  modellarida bepul limit 0: billing ulanmaguncha 429 -> demo rejim. `npm run tryon:model` sun'iy model surati yaratadi
- Xaridor surati faqat xotirada: bazaga/diskka yozilmaydi; fal CDN'ga `expiresIn: "1h"` bilan yuklanadi,
  natija `sync_mode` bilan javobda qaytadi
- Demo rejim: kalit yo'q, kunlik limit (`TRYON_DAILY_LIMIT`, 40), xato yoki `TRYON_TIMEOUT_MS` (45 s) ->
  `public/tryon-demo/<sku>.jpg` (bo'lsa) yoki brauzerda taxminiy ustma-ust ko'rinish, "DEMO REJIM" yozuvi bilan
- `npm run check:tryon [surat.jpg]` kalitni tekshiradi; `npm run tryon:prepare -- model.jpg [SKU,...]` demo
  natijalarini yaratadi. Bu muhitdan fal.ai bloklangan: haqiqiy API faqat foydalanuvchi kompyuterida sinaladi
- UI: `src/components/shopper/TryOnModal.tsx` (rozilik -> kamera/yuklash -> ko'rib chiqish -> natija)
- Lokal provayder (`TRYON_PROVIDER=local`): `tryon-local/server.py` (FastAPI + CatVTON-MaskFree, detectron2'siz,
  Windows'da pip bilan o'rnatiladi; `setup.bat`, `start.bat`). Standart 768x576 bf16 (6 GB GPU), timeout 120 s,
  kunlik limit qo'llanmaydi. `--mock` rejimi GPU'siz sinov uchun. Adapter: `src/lib/tryon/local.ts`
- Progressiv natija: lokal server `POST /tryon/stream` (NDJSON) bitta generatsiyada 25/50/75% qadamlarda DDIM
  `pred_original_sample` ni dekodlab yuboradi; `/api/tryon` `{stream: true}` bilan oqimni brauzerga uzatadi,
  `TryOnModal` kadrlarni ustma-ust silliq almashtiradi. Presetlar: tez 768x576/20, orta 768x576/40, sifat 1024x768/50 (orta keyinchalik 50 qadamga oshirildi)
- Niqobli rejim (standart, `--mode mask`): `tryon-local/masker.py` (MediaPipe selfie_multiclass + pose_landmarker_full,
  modellar `tryon-local/models/` ga avtomatik yuklanadi) kiyim niqobini yasaydi, yuz/soch/kaftlar himoyalanadi.
  `CatVTONPipeline` (base `booksforcharlie/stable-diffusion-inpainting`, `zhengchong/CatVTON` mix) faqat niqob ichini
  chizadi, natija va oraliq kadrlar asl suratga yumshoq niqob bilan qayta yopishtiriladi. Yaroqsiz surat (odam yo'q,
  yelka ko'rinmaydi, juda yaqin) -> 422 -> `TryOnResult` `{mode: "photo", message}` -> modal "Qayta suratga tushish".
  `/health` version 3 + `mode`. `--mode maskfree` eski niqobsiz model. `--mock` da ham niqob va tekshiruv ishlaydi.
  numpy 1.26 (torch 2.4) uchun `opencv-contrib-python==4.10.0.84` qotirilgan
- Niqob geometriyasi pozadan: tana ko'pburchagi (yelkadan yuqori: yoqa/bo'yin) + qo'l chiziqlari; kadrdan tashqaridagi
  nuqtalar ham taxminiy koordinata sifatida ishlatiladi; tops uchun ko'rinib turgan tizza/son chiqariladi; kaftning
  faqat teri piksellari himoyalanadi. Server (`Job`, `fit_box`, `compose`): odam chegarasi bo'yicha 3:4 kesim ->
  model -> natija asl surat o'lchamida (`MAX_OUTPUT_SIDE` 1600) yopishtiriladi. Brauzer surati 1536 px gacha.
  `/health` version 4
- Segmentatsiya ishonch xaritalari bilinear kattalashtirilib argmax qilinadi (silliq chegara); niqob fonga faqat
  ingichka chiziq (k/2) bilan kiradi (keng bo'shliqda model yorug' hoshiya chizardi). Kadrdan tashqari kesim qismida
  niqob ham chetdan davom ettiriladi (aks holda kadr chegarasida chiziq chiqadi). Modal ramkasi surat nisbatida
- Qo'l chiziqlari 0.3*sw, ko'rinadigan qo'l o'qi (0.1*sw) sinfidan qat'i nazar niqobga kiradi (to'q yeng fon deb
  aniqlanib, eski kiyim bo'laklari qolardi). `Engine.refine`: yakuniy natija qayta segmentlanadi; niqob ichida fon
  deb aniqlangan, asl fonga yaqin (6%) chekka eng yaqin niqobdan tashqi asl fon rangi bilan to'ldiriladi
  (`distanceTransformWithLabels`): yangi kiyim tor bo'lganda chiqadigan "hoshiya" yo'qoladi. Faqat yakuniy natijada.
  Segmentator hoshiyani ko'pincha "kiyim" deydi, shuning uchun rang ham tekshiriladi: kiyim sinfidagi piksel yangi
  kiyim medianasidan ko'ra yaqin fonga ancha yaqin bo'lsa (d_bg < 0.6*d_garment) u ham to'ldiriladi; teri/yuz/soch
  hech qachon. `fit_box`: odam tegib turgan kadr chetida kesim kadrdan 4% tashqariga chiqadi (model rasm chekkasida
  rangli chiziq chizardi). Tozalash chizig'i kengligi gavdaga nisbatan (0.1 * yelka kengligi,
  `Job.shoulder`), kadrga nisbatan emas: uzoqdan olingan suratda qo'l butunlay surtilib ketardi. Qat'iy rang
  chegaralari: fon sinfi uchun d_bg < 60, kiyim sinfi uchun d_bg < 35

## Texnik eslatmalar (5-bosqichdan keyin)
- Demo holati: `/admin/holat` (Basic Auth). Tekshiruvlar `src/lib/health.ts` dagi `runChecks()`: baza, SI (tekin
  `models.list`, 6 s), kiyintirish (lokal `/health`, 3 s; pullik provayderlar chaqirilmaydi), tayyor demo natijalari
  (`public/tryon-demo` vs SKU'lar), tovar rasmlari (SVG ulushi), admin paroli. Terminalda: `npm run check:demo`
  (xato bo'lsa exit 1)
- Zaxira rejimlar: `src/lib/demo-settings.ts` (`llmOff`, `tryOnDemo`), faqat jarayon xotirasida (`globalThis`),
  server qayta ishga tushganda o'chadi. `/admin/holat` dagi server action bilan almashtiriladi. `llmOff`:
  `understandQuery` LLM'ni chaqirmaydi (mode `kalit`), isitish ham o'chadi, sarlavhada sariq "Zaxira rejim" belgisi.
  `tryOnDemo`: `tryOn()` darhol demo natija qaytaradi ("demo rejim qo'lda yoqilgan")
- Telefondan sinash: `src/lib/lan.ts` (`shopperUrl`: Host sarlavhasi yoki birinchi xususiy IPv4), QR `src/lib/qr.ts`
  (`qrcode`, SVG, serverda). Panelda "Telefondan sinash" oynasi va `/admin/holat` da. `next.config.ts`
  `allowedDevOrigins` xususiy tarmoqlar uchun: aks holda Next 16 dev telefon (IP orqali) so'rovlarini bloklaydi
- Kiosk: xaridor ekrani 120 s harakatsizlikdan keyin (`IDLE_RESET_MS`) suhbat va kiyintirish oynasini tozalaydi,
  "Yangi suhbat" tugmasi. `demo.bat`: kiyintirish serveri + `npm run dev` + brauzerda holat/panel/xaridor ekrani
- Rate limit kaliti: Next `x-forwarded-for` ni socket manzilidan to'ldiradi, ya'ni har telefon alohida hisoblanadi

@AGENTS.md
