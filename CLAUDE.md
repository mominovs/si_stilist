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
Kamera orqali tashqi ko'rinish yoki teri tusi tahlili bu versiyada YO'Q. Istisno (foydalanuvchi qarori): jonli oynada
o'lcham tavsiyasi uchun faqat yelka va gavda nisbati o'lchanadi (yuz va teri tahlil qilinmaydi), o'lchov faqat
seans davomida brauzer xotirasida turadi va saqlanmaydi, ekranda "taxminiy" deb yoziladi.

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

## Texnik eslatmalar (review'dan keyin)
- Suhbat konteksti: xaridor ekrani ko'rib turilgan javobdagi `parsed` ni `POST /api/search {text, context}` bilan
  yuboradi (server `parsedQuerySchema` + `normalizeQuery` bilan qayta tekshiradi). LLM uni `<oldingi_sorov>` ichida
  oladi (qoidalar va misol promptda). `src/lib/query/context.ts` `mergeWithContext`: zaxira tahlilchida doim,
  LLM'da xavfsizlik to'ri (kategoriya tushib qolsa yoki davom gapi "boshqa" deyilsa). Boshqa kategoriya = yangi
  mavzu. "arzonrog'i"/"qimmatrog'i" narx darajasini bir pog'ona suradi (`detectFollowUp`)
- Byudjet `narx_max` (so'm, ParsedQuery'da; eski yozuvlar uchun `withDefaults`): LLM sxemasi, `detectBudget`
  ("300 ming so'mgacha", "1,5 mln", "до 300 тыс", "250 000 so'm"), normalize (<1000 bo'lsa x1000), moslashtirishda
  yumshoq ("Byudjetdan qimmatroq", aniq mos emas). Filtr panelida byudjet va o'lcham tugmalari
- Tahlilchi: byudjetdagi raqam o'lcham emas; `xl`/`xxl`/`xs`/`2xl` kichik harfda; bitta S/M/L faqat katta harfda
  yoki "o'lcham"/"razmer" yonida. Moslashtirish: `maqsad` mos kelmasa aniq mos emas ("Bayram uchun emas")
- Analitika: tushunilmagan so'rov (parsed null) holat statistikasiga kirmaydi (`totals.understood`, foizlar
  shundan). Talab kaliti kategoriya + ranglar + jins ("erkaklar uchun oq futbolka"). Turi `yoqmadi`: topilgan, lekin
  "mos kelmadi" baholangan
- Baho va sotuvchiga ko'rsatish: `Request.feedback` ("mos" | "mos-emas"), `RequestResult.reservedAt/reservedSize`
  (migratsiya `20261006120000_feedback_reservation`, qo'lda yozilgan: prisma dev shadow bazasi bilan `migrate dev`
  "type Gender already exists" beradi; yangi migratsiyani qo'lda yozib `prisma migrate deploy`). API
  `POST /api/feedback`, `POST /api/reserve` (faqat shu so'rovda ko'rsatilgan tovar va omborda bor o'lcham, 2 soat).
  `SellerModal` katta kod (#requestId), panelda "Sotuvchiga ko'rsatilgan" ro'yxati va plitkalar
- Admin himoyasi: `src/lib/admin-auth.ts` (`checkAdminAuth`, timing-safe). proxy, har bir server action
  (`requireAdmin`) va admin route'lar (`adminGuard`: `/api/panel`, `/api/panel/reset`, `/admin/export`)
- Telefon kamerasi: `isSecureContext` bo'lmasa (HTTP Wi-Fi manzil) jonli kamera o'rniga `<input capture="user">`
  ("Kamera bilan suratga olish"). `allowedDevOrigins` ga kompyuterning hozirgi IPv4 manzillari ham qo'shiladi
- `npm run lint` `tryon-local/**` ni tekshirmaydi (.venv va CatVTON ichidagi begona JS)

## Texnik eslatmalar (6-bosqichdan keyin)
- Real vaqt oynasi Decart o'rniga lokal **DM-VTON** (foydalanuvchi tanlovi: bepul, 6 GB GPU). `tryon-local/mirror.py`:
  model kodi `tryon-local/KiseKloset` (mualliflar demosi, commit 118e0da, setup.bat klonlaydi) dan cupy'siz yuklanadi:
  `correlation()` FlowNet2 cupy yadrosini PyTorch'da aynan takrorlaydi (sinovda farq 2e-7). Og'irliklar
  `models/dmvton/mobile_{warp,gen}.pt` (Google Drive, gdown; bu muhitdan Drive bloklangan, haqiqiy natija faqat
  foydalanuvchi kompyuterida). Kirish: oq fon, ko'z-son kesimi (demodagidek padding), 192x256; natija faqat kiyim
  niqobi ichida (fon chiqarib tashlanadi) asl kadrga
- Server: `POST /mirror/garment {id, image}`, `POST /mirror?id=` (tana va javob JPEG), 422 kadrda odam yo'q, 404 kiyim
  yuborilmagan, 503 oyna o'chiq. `/health` version 5 + `mirror` (off|ready|error). Oyna CatVTON'dan oldin yuklanadi.
  Niqob fonda yangilanadi (`_mirror_analyze`, 0.12 s dan eski bo'lsa), 1 s dan eski bo'lsa kutib hisoblanadi.
  `--mock` da `MockMirror`, `--no-mirror`. `port_is_free` endi connect bilan (bind TIME_WAIT'ni band derdi)
- Sayt: `src/lib/tryon/mirror.ts` (kiyim bir marta yuboriladi, 404 da qayta), `POST /api/mirror?productId=`
  (tovar 1 daqiqa keshda, 2400/daqiqa), `/oyna` sahifasi (`MirrorView`: kadr tsikli ketma-ket, 480 px JPEG, oyna
  teskari, 60 s seans, kiyim almashtirish, "Sifatli surat" -> `TryOnModal initialPhoto`). Faqat
  `MIRROR_CATEGORIES` (futbolka, ko'ylak, sviter, kurtka). Holat sahifasida "Jonli oyna" tekshiruvi
- Og'irliklar ikki manbadan (`ensure_weights`): demo fayl ID'lari, keyin DM-VTON repo papkasi
  (`gdown.download_folder(skip_download=True)` bilan ro'yxat, faqat `dmvton_pf_{warp,gen}.pt` yuklanadi; ikkala
  ta'rif kalit/o'lcham bo'yicha bir xil, tekshirilgan). Ikkala nom ham qabul qilinadi; bo'lmasa `MANUAL_HELP`.
  `python mirror.py` (setup.bat) traceback'siz yuklaydi
- Telefonda jonli kamera: `npm run dev:https` (`next dev --experimental-https`, mkcert; `certificates/` gitignore'da).
  `shopperUrl(host, x-forwarded-proto)`: QR https manzil beradi, telefon sertifikat ogohlantirishini o'tkazib yuboradi
- Oyna sifati: model egish xaritasini (last_flow, [-1,1]) kesim o'lchamiga (ko'pi bilan `HR_SIZE` 576x768)
  kattalashtirib, kiyimning tiniq nusxasiga `grid_sample` qiladi; model chizgan qism va aralashtirish niqobi silliq
  kattalashtiriladi (identik xarita sinovida farq ~1/255, chegaralar ~3x tiniq). `prepare_analysis`: kesim va
  yumshoq niqob niqob yangilanganda bir marta hisoblanadi, poza oldingisi bilan o'rtachalanadi (titrash yo'q).
  JPEG `cv2.imencode` q85, `X-Mirror-Ms` sarlavhasi. Brauzer: 640 px kadr, `IN_FLIGHT = 2` parallel ishchi (eski
  kadr yangisining ustiga chizilmaydi), ekranda kadr/s va kechikish (server qismi bilan)

@AGENTS.md

## Texnik eslatmalar (o'lcham tavsiyasi)
- Hisob `src/lib/sizing.ts` (toza funksiyalar, testlar bor): `estimateBody` (ixtiyoriy bo'y, vazn, kamera nisbati ->
  ko'krak va yelka, ishonch past/o'rta/yuqori; hech biri bo'lmasa null), `sizeSpec` (standart jadval: harfli erkak/ayol,
  raqamli = ko'krak/2; uniseks erkaklar jadvali), `fitSizes` (har o'lcham: juda-tor/tor/mos/keng/juda-keng, tavsiya =
  eng yaqini), `fitAccuracy`. Kurtka/sviter/kostyum ustidan kiyiladi: tanaga qo'shimcha kenglik
- Kamera: lokal server `/mirror` javobida `X-Mirror-Body` `{pts: yelka/son nuqtalari 0..1, r: yelka/gavda nisbati, t}`
  (`mirror.py body_measure`, faqat yelka va sonlar aniq ko'ringanda; belgacha kadrda r yo'q). Nisbat odatdagi nisbatga
  (`TYPICAL_RATIO`, taxminiy ~0.6) solishtiriladi, yelkani ko'pi bilan ±20% o'zgartiradi. `/health` version 6
- `MirrorView` + `SizePanel`: bo'y/vazn/jins faqat brauzer holatida, kamera nisbati oxirgi 40 o'lchov mediani (8 tadan
  keyin), 40 kadr nisbatsiz bo'lsa "uzoqroq turing". Tanlangan o'lcham kadrda strelkalar bilan (tor: ichkariga,
  keng: tashqariga, juda: ikki qavat, mos: yashil). Kiyimni sun'iy cho'zib ko'rsatish ataylab yo'q (chalg'itadi)
- `POST /api/mirror/order {productId, size, recommended}`: Request (mode `oyna`, parsed: kategoriya, jins, rang,
  o'lcham) + RequestResult (reserved, `recommendedSize`). Omborda yo'q o'lcham = buyurtma, panelda "tugagan" talab
- Panel: "Sotuvchiga ko'rsatilgan" da SI tavsiyasi va sotuvchi belgilaydigan "to'g'ri kelgani" (`POST /api/panel/fit`,
  `fittedSize`), aniqlik: aniq va ±1 o'lcham. Migratsiya `20261007120000_size_fit`; `npm run dev` lokal bazada
  yangi migratsiyalarni o'zi qo'llaydi (`scripts/ensure-db.mjs`)

## Texnik eslatmalar (oyna: aylanish va pozalar)
- `mirror.py body_view`: old/yon/orqa (orqa: yelkadan yuqorida yuz terisi < 12% (soch bor) yoki |yaw| > 125;
  yon: 55 <= |yaw| <= 125 (yelkalar z farqidan) yoki yelka/gavda < 0.3), `arms_up` (bilak yelkadan yuqori).
  Server ko'rinishni 3 ta ketma-ket tahlil mos kelsa almashtiradi, burilganda poza EMA o'chadi. `/health` version 7
- Kiyim uch variantda (`MirrorEngine.set_garment(id, image, back)`): old = rasm, yon = `plain_garment` (naqshsiz,
  keng xiralash, bo'yin o'yig'i qisman yopiq), orqa = do'kon surati (`public/products/<sku>-orqa.*`,
  `garmentBackUrl`) yoki tekis variant. `/mirror/garment {id, image, back?}`
- `compose_frame(frame, analysis, infer, state)`: `track_analysis` (DIS optik oqim 160 px, ~3 ms: niqob, fon va
  kesim joriy kadrga suriladi), `shading_map` (eski kiyim yorug'ligi, sigma 0.12*yelka, 0.75..1.2, kuch 0.7),
  turg'unlikda natija oldingisi bilan aralashadi (harakat < 0.5 px: 50%, > 2 px: 0%)
- Sayt: `X-Mirror-Body` da `view`, `arms_up`; `MirrorView` burchakda "Old/Yon/Orqa tomon" belgisi, qo'llar
  ko'tarilsa maslahat; o'lcham belgilari va kamera o'lchovi faqat old tomonda
- Cheklov: DM-VTON faqat old tomonda o'qitilgan (VITON). Yon/orqa natija taxminiy, haqiqiy 360 uchun ko'p
  ko'rinishli ma'lumot bilan qayta o'qitish yoki 3D kerak

## Texnik eslatmalar (oynani qo'shimcha o'qitish)
- Ma'lumot foydalanuvchi kompyuterida (`tryon-local/dataset/`, gitignore): `kiyimlar/<k>_old|orqa|yon.png`,
  `<ko'rinish>/<odam>/<k>.jpg` (bir poza, faqat ustki kiyim o'zgargan; kiyim nomiga mos kelmagan rasm = asosiy, faqat
  kirish). Rasm generatori (ChatGPT) bilan yaratiladi; bitta asosiy suratdan N tahrir -> N*(N-1) juftlik
- `dataset_prep.py` (`prep.bat`): ECC affin tekislash (kiyimdan tashqari joylar bo'yicha), masker bilan niqob/fon/poza,
  juftlik bahosi: kiyimdan tashqari farq (yaxshi <= 10, o'rtacha <= 18) va poza siljishi / yelka (0.08 / 0.15).
  Natija `dataset/_tayyor/` (rasm, `_kiyim.png`, `_fon.png`, `.json`), `pairs.json`, `hisobot.txt/jpg`
- `train_mirror.py` (`train.bat --view orqa`): KiseKloset AFWM + generator, hozirgi og'irliklardan boshlanadi;
  kirish/maqsad jonli oynadek kesiladi (192x256, oq fon). Yo'qotish: L1 + 0.2 VGG (natija va egilgan kiyim), qirra,
  comp, oqim silliqligi. 3+ odam bo'lsa oxirgisi tekshiruv, faqat yaxshilansa `models/dmvton/<view>_{warp,gen}.pt`.
  `MirrorEngine.nets`: ko'rinish modeli bo'lsa shu ko'rinishda, aks holda old modeli; `/health` `mirror_models`
- Bu muhitda faqat CPU va tasodifiy og'irliklar bilan sinalgan (zanjir ishlaydi), haqiqiy o'qitish foydalanuvchi GPU'sida
- `mirror.garment_mask`: katalog rasmidan kiyim niqobi (oq kiyim oq fonda ham): fon = chet mediani, farq > max(4,
  3*shovqin+2) yoki Canny konturi, yopish (1.2%), tashqi kontur to'ldiriladi, eng kattasining 15% idan kichik bo'laklar
  (soya) tashlanadi. Avval "min < 235" edi: oq kiyim fon deb o'chib ketardi (o'qitishda ham, jonli oynada ham).
  `prep.bat` `dataset/kiyimlar_hisobot.jpg` da har kiyimni model ko'radigan ko'rinishda chiqaradi
- `train_mirror.py --view old|orqa|yon|hammasi`: `garment_variants` jonli oynadagi kiyimni takrorlaydi (old: rasm;
  orqa: orqa surati + naqshsiz aralash, tekshiruv birinchisida; yon: naqshsiz). Saqlangan `<view>_*.pt` dan davom
  etadi (`--toza`), faqat tekshiruvda yaxshilansa saqlaydi; old tekshiruvsiz (3 odamdan kam) hech qachon saqlanmaydi.
  `MirrorEngine` `old_*.pt` ni ham yuklaydi (asl o'rniga), `trained` ro'yxati `/health` `mirror_models` da
- Rasmli rejimni o'qitish `train_photo.py` (`train_photo.bat`): o'sha `dataset/_tayyor/pairs.json` (old va orqa), misol =
  maqsad surat, kirish va maqsad niqoblari birlashmasi bilan bo'yalgan, kiyim rasmi; odam atrofidan 3:4 kesim. CatVTON
  `get_trainable_module(unet, "attention")` (attn1) fp32 + UNet bf16 autocast, gradient checkpointing, latentlar
  oldindan (VAE CPU'da), AdamW8bit (bitsandbytes bo'lsa), 10% kiyimsiz (CFG), yo'qotish faqat odam yarmida, niqob x3.
  Saqlash `safetensors.save_model` (attn ro'yxatida takror nomlar) + `metadata={"format": "pt"}` (accelerate talabi):
  `models/catvton_ft/mix-48k-1024/attention/model.safetensors`, faqat tekshiruvda yaxshilansa; odam < 3 bo'lsa
  `catvton_ft_sinov` (avtomatik yuklanmaydi). Server niqobli rejimda shu fayl bo'lsa `--weights` = shu papka,
  `/health` `photo_model`. Bu muhitda kichik tasodifiy UNet/VAE bilan CPU'da sinalgan (davom ettirish ham)
- Kechasi o'qitish `tryon-local/kechasi.bat <soat>`: stop -> prep -> `train_photo --daqiqa 70% --height 768 --width 576`
  (exit 3 = CUDA OOM -> 512x384 da qayta) -> `train_mirror --view hammasi --daqiqa 30%`, log `runs/kechasi.log`.
  `--daqiqa`: vaqt bo'yicha (train_mirror'da ko'rinishlarga teng bo'linadi), train_photo LR 100 qadam isinish + kosinus
  (10% gacha), oyna aksi bilan ikki barobar (`--aks-yoq`), Windows `SetThreadExecutionState` (uyquga ketmasin).
  Kiyim fayli `<nom>_old.*` bo'lishi shart (`_` siz fayllar, masalan libos/shim, prep'da e'tiborga olinmaydi)
- FLUX 3 Image Klein sinovi (`tryon-local/flux_sinov.py`, `setup_flux.bat`, `flux_sinov.bat`): alohida `.venv-flux`
  (diffusers dev b800f82 torch>=2.6 va huggingface_hub>=1.32 talab qiladi, asosiy `.venv` bilan mos emas). Step-distilled
  `black-forest-labs/flux-3-image-klein`, `Flux3DistilledAutoBlocks` dan `prompt_upsampler` va `text_encoder` olib
  tashlanadi, `prompt_embeds` beriladi (`Flux3TextEncoderStep._get_qwen3_vl_prompt_embeds`, CPU bf16 yoki `--te gpu4bit`,
  kesh `models/flux3_kesh`). Transformer `variants/nvfp4` single-file + `BFLQuantizationConfig` (Ampere'da har qatlam
  bf16 ga ochiladi), VAE fp32 + tiling, hammasi GPU'da yoki `--offload` (ComponentsManager, transformer qo'lda `add`).
  Ko'rsatma qolipi `instruction(kind)` (upsampler "i2i" uslubi). Server/sayt FLUX'ni ishlatmaydi: faqat solishtirish
  (CatVTON server orqali, keyin stop.bat). Bu muhitda kichik tasodifiy Flux3/VAE bilan CPU'da sinalgan

## Texnik eslatmalar (internetga ochish)
- `run-all.bat`: avval oldingi nusxalarni yopadi (oyna nomlari bo'yicha taskkill /T, ngrok.exe, 3000-portni egallagan PID, `tryon-local/stop.bat`), keyin `scripts/public-check.mjs` (ADMIN_PASSWORD yo'q, `demo123` yoki < 8 belgi bo'lsa to'xtaydi;
  LLM_DAILY_LIMIT > 200 ogohlantirish; `--domain` NGROK_DOMAIN ni chiqaradi) -> tryon-local, `npm run build`,
  `npm start`, `ngrok http --domain=<NGROK_DOMAIN> 3000` (eski ngrok `--url` ni bilmaydi); har biri alohida oynada `scripts/qayta.bat` ichida (to'xtasa
  5 s dan keyin qayta). Production (`next start`): dev'dagi `allowedDevOrigins` muammosi yo'q; ngrok Host va
  `x-forwarded-proto: https` beradi, QR kod ngrok manzilini ko'rsatadi, `x-forwarded-for` har mijozni ajratadi
- `MirrorView.frameBudget`: xususiy bo'lmagan host (ngrok) da 400 px, JPEG 0.7, 1 ishchi, kadrlar orasida
  kamida 125 ms (tekin ngrok trafigi ~1 GB/oy); localhost/LAN da avvalgidek 640 px, 2 ishchi
- Lokal demo `run-local.bat` (ngrok orqali jonli oyna qotib, uzilib qolardi): `scripts/tozala.bat` (run-all bilan
  umumiy: oynalar, 3000/3443-portlar, ngrok, tryon stop), tryon-local, `npm run build`, `npm start`,
  `scripts/https-proxy.mjs` (har biri `qayta.bat` ichida). Proksi: https://IP:3443 -> 127.0.0.1:3000, `selfsigned`
  sertifikat (`certificates/lan/`, SAN: localhost + hozirgi IP'lar, yangi IP bo'lsa qayta yaratiladi),
  `x-forwarded-proto/host/for`, terminalda QR. `LAN_HTTPS_PORT` o'rnatilsa `shopperUrl` localhost'dan
  ochilgan panelda ham telefonga https://IP:3443 beradi; ngrok host'iga endi port qo'shilmaydi (testlar `lan.test.ts`). QR uchun IP: `run-local.bat`
  `scripts/select-lan-ip.ps1` bilan `LAN_IP` ni tanlaydi (faol hotspot = Wi-Fi Direct adapteri, bo'lmasa shlyuzli
  jismoniy adapter); `preferLanAddress` (lan.ts va https-proxy.mjs) uni birinchi qo'yadi, kompyuterda bo'lmasa bir marta
  ogohlantirib avtomatik tartibga qaytadi (virtual adapterlar oxirida). Hotspotni run-local.bat dan oldin yoqish kerak
- Mahsulot suratlari `public/products/<sku>.jpg` (oq fon, ~1200 px): progressive JPEG q88, jami ~8 MB (asli 87 MB edi,
  telefon hotspot orqali har kartochkada 2-3 MB yuklardi). Yangi surat qo'shilsa ham shunday siqing
- Jonli oyna vaqt bilan cheklanmagan (foydalanuvchi qarori, lokal model bepul): kadrda `MIRROR_IDLE_SECONDS` (15..600,
  standart 60) davomida odam ko'rinmasa (kiyintirilgan kadr kelmasa: 422) yopiladi; 15 s dan keyin qolgan vaqt
  ko'rsatiladi. `/oyna` -> `MirrorView idleSeconds`. Eski `MIRROR_SESSION_SECONDS` endi ishlatilmaydi

## Texnik eslatmalar (kiyim to'liq kiyilgandek)
- Rasmli rejim niqobi kiyim turiga moslanadi: sayt `kind` (katalog kategoriyasi) yuboradi (`local.ts`, `index.ts`),
  `masker.analyze(image, part, kind, shape)`. `TOP_LENGTH` (etak: futbolka 0.15 ... kurtka 0.38 tana uzunligi),
  `LOOSE` (sviter/kostyum/kurtka siluetdan fonga chiqishi, yelka ulushida). Libos va yubka: `garment_shape(image, kind)`
  katalog rasmidan beldan etakkacha uzunlik va etak kengligini bel kengligiga nisbatan o'lchaydi (libosda bel =
  22-55% oralig'idagi eng tor joy), odamda `WAIST_SW = 0.65` yelka (do'kon suratlarida kalibrlangan: tizzagacha libos
  tizzagacha, maksi to'piqqacha); etak trapetsiyasi oyoqlar orasidagi fonni ham qamraydi (`open_area`)
- Server standart `--preset orta` (`TRYON_PRESET` muhit o'zgaruvchisi, run-local.bat). `sifat` 6 GB GPU'da sinovda
  82 s va jonli oyna kadri ~350 ms (Windows umumiy xotiraga chiqaradi, OOM bermaydi). Haqiqiy OOM bo'lsa `run()`
  `orta` ga o'tadi. `vae.enable_slicing()`. Sayt lokal kutish vaqti 180 s. `/health` version 8
- Ko'p xaridor: kiyintirish navbati `MAX_QUEUE` (`TRYON_MAX_QUEUE`, standart 2: ishlanayotgan + kutayotgan),
  ortig'iga 429 -> sayt `{mode: "photo", message}` ("band, keyinroq"). Jonli oyna bir vaqtda ko'pi bilan 2 seans
  (`/api/mirror` `claimMirror`, `X-Mirror-Session`, 4 s kadr kelmasa bo'shaydi, uchinchisiga 409). Lokal server har
  seans holatini alohida saqlaydi (`MirrorSession`: niqob/poza keshi, ko'rinish tarixi, silliqlash; `/mirror?s=`,
  60 s kadr kelmasa tashlanadi). Kontur: `cover > 0.6` va eroziya (chetdagi och hoshiya olinmaydi)

## Texnik eslatmalar (jonli efir)
- `/efir/[code]` (`EfirRoom`, telefon uchun): ikki do'st video qo'ng'iroqdek. Tepada sherikning kiyintirilgan videosi
  (katta), burchakda o'zi (oyna kabi teskari), pastda kiyimlar: har birida "Kiyish" (o'zi) va "Taklif" (sherik
  ekranida kiyim rasmi va "Kiyish" tugmasi bilan). Matnli chat yo'q: gaplashish ovoz bilan
- Ovoz va video WebRTC, telefondan telefonga: yuboriladi `outRef` canvas `captureStream(15)` (kiyintirilgan tasvir,
  kamera xom tasviri emas) + mikrofon. Taklifchi = pid'i kichigi, javob 8 s kelmasa qayta taklif; kamera qayta
  yoqilsa "bye" va yangi ulanish. Signallar server orqali (`postSignal`, holat so'rovida olinadi, har 1 s).
  STUN google (internetda); lokal tarmoqda host nomzodlar yetadi, TURN yo'q
- Zaxira: WebRTC ulanmasa (yoki brauzerda yo'q) sherikning oxirgi kiyintirilgan kadri server orqali:
  `/api/mirror` `X-Efir-Room/X-Efir-Pid` bo'lsa `publishFrame`, ko'ruvchi `/api/efir/[code]/frame?after=seq` (150 ms)
- Xona holati `src/lib/efir.ts` (faqat xotirada, globalThis; testlar `efir.test.ts`): ko'pi bilan 2 ishtirokchi,
  20 s holat so'ramagan chiqqan hisoblanadi, xona 30 daqiqa harakatsizlikdan keyin o'chadi, kod 6 belgi (maxfiy
  havola), har ishtirokchining faqat oxirgi kadri (3 s dan eski = jonli emas). API: `POST /api/efir` (yangi xona),
  `GET/POST /api/efir/[code]` (holat; join | chat (faqat kiyim taklifi uchun ishlatiladi) | signal)
- `/oyna` da "Do'st bilan jonli efir" tugmasi (`StartEfirButton`). Xonada yolg'iz bo'lsa QR va havola
  (`shopperUrl`: localhost'dan ochilsa ham telefon uchun https://IP:3443). Kadr 480 px, bittadan
  yo'lda (GPU ikki kishi orasida bo'linadi). Tovarlar `src/lib/mirror-cards.ts` (/oyna bilan umumiy)
- Efir vaqt bilan cheklanmagan: ikkala efirda ham odam ko'rinmasa `EFIR_IDLE_MS` (10 daqiqa) dan keyin server xonani
  yopadi (`Room.presence` faqat `publishFrame` da yangilanadi, ya'ni kadrda odam bo'lganda; `closedAt`, holatda
  `closed`/`closesInMs`). Oxirgi 2 daqiqada ogohlantirish, yopilganda kamera va WebRTC o'chadi, "Efir yopildi".
  Boshqaruv qatorida ulanish holati faqat ulanmaganda ("To'g'ridan-to'g'ri ulangan" va taymer yo'q)
- Sinov: ikki Chromium (soxta kamera/mikrofon) bilan: WebRTC ulandi, ikki tomonda video va ovoz, taklif va
  "Kiyish", uchinchi kishi 409; WebRTC o'chirilganda server orqali zaxira ishladi
- Jonli oyna: `MirrorEngine.run(..., with_cover=True)` model egib qo'ygan kiyim konturini (warped_edge) ham qaytaradi;
  `compose_frame` -> `cover_masks`: kompozitsiya niqobi = eski kiyim niqobi + yangi kiyim konturi (odamdan
  `COVER_REACH` 0.18 yelka ichida, yuz/sochdan tashqari: `prepare_analysis` `reach`, `protect`); eski kiyim bor,
  yangisi yo'q va model oq chizgan joy faqat fon yaqinidagi chekkada (`edge`) asl fon bilan to'ldiriladi
  (`background_fill`). `reach`/`edge` ham optik oqim bilan suriladi. Qo'shimcha xarajat ~2 ms/kadr
  (oq aniqlash `cv2.inRange`)

## Texnik eslatmalar (dizayn)
- Brend tizimi Claude Design'dan ("vizual identitet va UI"): to'q olxo'ri `brand` #2B1638, marjon-qizil `accent` #C23B44
  (asosiy harakat tugmalari), qum fon `sand` #F7F1EA, `surface`/`surface-2`, `line`, `ink`, `muted`, holatlar
  `success`/`warning`/`danger` (+ `-soft`, `-dot`), `live`. Hammasi `src/app/globals.css` `@theme` da: Tailwind klasslari
  `bg-brand`, `text-accent`, `bg-sand` ... Eski `neutral`/`rose` ranglari ishlatilmasin
- Shriftlar o'zimizda (`public/fonts`, internetsiz ham bir xil, OFL): sarlavhalar Bricolage Grotesque 800
  (`h1-h3`, `.font-display`), matn Manrope
- Komponent klasslari (`@layer components`): `btn` + `btn-primary|brand|ghost|soft`, `btn-lg|sm`, `icon-btn`, `chip`
  (`chip-on`, `chip-off`, `chip-size`), `badge` (`badge-ok|warn|danger|brand`), `live-dot`, `card`, `card-lift`,
  `panel`, `modal`, `scrim`, `toast`, `field-label`, `field`, `camera-dark`, `bubble-user|ai`, `skel`, `eyebrow`
- Logo (ilgich + uchqun): `src/components/brand/Logo.tsx` (`Logo`, `LogoMark`, `HangerIcon`, `SparkIcon`), favicon
  `src/app/icon.svg`. Umumiy sarlavha `SiteHeader` (`active`: stilist|oyna|panel, telefonda faqat belgi)
- Oq fondagi tovar rasmi: `mix-blend-multiply` faqat rasmning o'zida, fon rangi o'rab turgan elementda bo'lsin
  (rasmning o'z `bg-*` klassi bilan oq quti ko'rinib qoladi)
- Ekranlar: xaridor (chat + kartochkalar), kiyintirish modali, `/oyna` (kamera chapda, o'lcham va kiyimlar o'ngda),
  `/efir` (tepada sherik + PiP, `bg-brand` boshqaruv qatori, pastda 3 ustunli kiyimlar "Kiyish"/"Taklif"), `/panel`
  (4 KPI, olxo'ri rangli "Qoniqtirilmagan talab" kartasi + "Yetkazuvchiga ro'yxat" CSV, brauzerda yasaladi).
  Admin sahifalari hali eski neytral uslubda
