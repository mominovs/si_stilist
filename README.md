# SI Stilist

Kiyim do'konlari uchun SI stilist va talab analitikasi. Loyiha tavsifi va bosqichlar: [CLAUDE.md](CLAUDE.md).

## Ishga tushirish (lokal)

Talablar: [Node.js 20+](https://nodejs.org) va [Git](https://git-scm.com). Docker shart emas.

Windows'da **Command Prompt** (cmd) oching. Buyruqlar System32 ichida emas, loyiha papkasida bajarilishi kerak:

```bash
cd %USERPROFILE%\Documents
git clone -b claude/blissful-ramanujan-y9ta93 https://github.com/mominovs/si_stilist.git
cd si_stilist
npm ci           # package-lock.json ni o'zgartirmaydi (npm install o'rniga)
npm run setup     # .env yaratadi, lokal bazani ishga tushiradi, 48 ta demo tovarni yuklaydi
npm run dev       # http://localhost:3000
```

- Xaridor ekrani: http://localhost:3000
- Do'kon paneli (jonli statistika va qoniqtirilmagan talab): http://localhost:3000/panel
- Admin: http://localhost:3000/admin

Panel va admin uchun login istalgan, parol `.env` dagi `ADMIN_PASSWORD` (standart `demo123`).
Demo oldidan panel pastidagi "Logni tozalash" tugmasi bilan namunaviy tarixni o'chirish mumkin
(qaytarish: `npm run db:seed`).

SI tahlil uchun `.env` ga `ANTHROPIC_API_KEY` qo'shing va serverni qayta ishga tushiring. Kalit bo'lmasa
yoki internet ishlamasa, xaridor ekrani kalit so'zlar bo'yicha oddiy tahlil va filtr tugmalari bilan ishlayveradi.

`npm run dev` lokal baza o'chiq bo'lsa uni o'zi yoqadi (kompyuter qayta yoqilgandan keyin ham).

Yangilash: `git pull`, keyin `npm ci`. Agar `git pull` "Your local changes ... package-lock.json" desa:
`git checkout -- package-lock.json` va qaytadan `git pull`.

Docker bilan ishlamoqchi bo'lsangiz: `docker compose up -d`, `.env` dagi `DATABASE_URL` ni Docker qatoriga
almashtiring va `npm run db:setup`.

## Internetga ochish: run-all.bat (ngrok, HTTPS)

Kompyuteringiz server bo'ladi: sayt doimiy `https://...ngrok-free.dev` manzilda ochiladi, HTTPS bo'lgani uchun
telefonda kamera va jonli oyna ham ishlaydi, Wi-Fi shart emas.

1. Bir marta: `winget install ngrok.ngrok`, [dashboard.ngrok.com](https://dashboard.ngrok.com) da ro'yxatdan o'ting,
   `ngrok config add-authtoken <token>`. **Domains** bo'limidan tekin doimiy domen oling.
2. `.env`: `NGROK_DOMAIN=sizning-nom.ngrok-free.dev`, kuchli `ADMIN_PASSWORD` (namunadagi `demo123` bilan ishga
   tushmaydi: panel butun internetga ochiq bo'lib qolardi) va `LLM_DAILY_LIMIT=100` (begonalar API pulini sarflamasin).
3. `run-all.bat` ni ikki marta bosing. Saytni production rejimda yig'adi, keyin uchta oyna ochadi: SI kiyintirish
   serveri, sayt va ngrok. Biror qismi to'xtab qolsa, 5 soniyadan keyin o'zi qayta ishga tushadi (`scripts\qayta.bat`).
   Butunlay to'xtatish: o'sha oynalarni yoping. Kompyuter uyquga ketsa sayt to'xtaydi:
   `powercfg /change standby-timeout-ac 0` (quvvatga ulanganda uyqu yo'q).
4. Telefon uchun QR kod: `https://<domen>/panel` dagi "Telefondan sinash".

Tekin ngrok trafigi cheklangan (oyiga ~1 GB). Shuning uchun jonli oyna internet orqali ochilganda kadrni kichikroq
(400 px) va sekinroq (8 kadr/s gacha) yuboradi; shu kompyuterda yoki bir Wi-Fi'da cheklov yo'q. ngrok birinchi
ochilishda brauzerda ogohlantirish sahifasini ko'rsatadi: "Visit Site" bosing.

## Demo kuni (taqdimot)

1. `demo.bat` (loyiha papkasida, ikki marta bosing): lokal kiyintirish serveri, sayt va uchta brauzer oynasi ochiladi:
   demo holati, do'kon paneli va xaridor ekrani. Yoki terminalda: `npm run check:demo`.
2. **Demo holati** (http://localhost:3000/admin/holat): hammasi yashil bo'lsin. Sariq/qizil kartochkada nima qilish
   kerakligi yozilgan.
3. **Zaxira rejimlar** (o'sha sahifada): internet yomon bo'lsa "SI'ni o'chirish" (so'rovlar kalit so'zlar bilan
   tushuniladi), kiyintirish serveri muammo qilsa "Kiyintirishni demo rejimga o'tkazish". Ikkalasi ham xaridor
   ekranida aniq belgilanadi va server qayta ishga tushganda o'chadi.
4. **Hakamlar telefondan**: panelda "Telefondan sinash" QR kodini ko'rsating. Telefon kompyuter bilan bir Wi-Fi'da
   bo'lsin. Windows birinchi marta "Node.js tarmoqqa ulanishiga ruxsat" so'rasa, **Allow** (xususiy tarmoq) bosing.
   Telefon brauzeri jonli kamerani faqat HTTPS'da beradi, shuning uchun Wi-Fi (HTTP) manzilda "O'zimda ko'rish"
   oynasida **"Kamera bilan suratga olish"** tugmasi chiqadi: u telefonning o'z kamera ilovasini ochadi.
   **Jonli oyna telefonda** (yoki noutbukda kamera yo'q bo'lsa): `npm run dev` o'rniga `npm run dev:https`. QR kod
   `https://...` manzil beradi. Telefon "Ulanish xavfsiz emas" deydi (sertifikat shu kompyuterda yaratilgan):
   **Qo'shimcha → Baribir o'tish** (Advanced → Proceed) bosing, keyin kameraga ruxsat bering. Noutbukda esa
   `https://localhost:3000` ochiladi. Muqobil: telefonni noutbuk kamerasi qilish (DroidCam, Iriun yoki Windows 11
   "Phone Link" kamera) va oynani noutbukda ochish.
5. **Tayyor kiyintirish natijalari**: ko'rsatiladigan tovarlar uchun oldindan
   `npm run tryon:prepare -- model.jpg FT-06,KY-01` (lokal server ishlab turgan bo'lsin). Model ishlamay qolsa,
   ilova shularni "Demo rejim" belgisi bilan ko'rsatadi.

**Jonli oyna** (`/oyna`, kartochkadagi "Jonli oyna" tugmasi): kamera oldida ustki kiyim real vaqtda ko'rinadi
(lokal DM-VTON, bepul, internetsiz), seans 60 soniya. "Sifatli surat" joriy kadrni asosiy SI bilan qayta chizadi.
Birinchi marta `tryon-local\setup.bat` ni qayta ishga tushiring (oyna modelini yuklaydi).

Xaridor topilgan tovarni baholaydi ("Ha, mos keldi" / "Yo'q, mos kelmadi") va o'lchamni tanlab
**"Sotuvchiga ko'rsatish"** ni bosadi: ekranda katta kod (#564) chiqadi, sotuvchi xuddi shu kodni panelning
"Sotuvchiga ko'rsatilgan" bo'limida ko'radi. Panelda xaridor bahosi va sotuvchiga ko'rsatishlar foizi ham bor.

Xaridor ekrani 2 daqiqa hech kim tegmasa boshlang'ich holatga qaytadi (keyingi odam oldingisining so'rovi va
suratini ko'rmaydi). "Yangi suhbat" tugmasi ham shu ishni qiladi.

## Onlayn joylash (doimiy ishlab turadigan havola)

GitHub faqat kodni saqlaydi, ilovani ishga tushirmaydi. Doimiy havola uchun bepul variant: **Vercel + Neon**.

1. [neon.tech](https://neon.tech) da ro'yxatdan o'tib, PostgreSQL loyiha yarating va connection string'ni nusxalang.
2. [vercel.com](https://vercel.com) ga GitHub orqali kiring, **Add New → Project** da `si_stilist` repo'sini tanlang.
3. **Environment Variables** ga qo'shing: `DATABASE_URL` (Neon manzili) va `ADMIN_PASSWORD`.
4. **Deploy**. Build vaqtida migratsiyalar avtomatik qo'llanadi (`vercel-build` skripti).
5. Demo tovarlarni bir marta yuklang (o'z kompyuteringizda, `.env` dagi `DATABASE_URL` ni Neon manziliga
   almashtirib): `npm run db:seed`.

## Skriptlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm run setup` | Birinchi marta: .env, lokal baza, migratsiya, demo tovarlar |
| `npm run db:start` / `npm run db:stop` | Lokal bazani yoqish / o'chirish |
| `npm run check:demo` | Demo oldidan umumiy tekshiruv (baza, SI, kiyintirish, demo natijalari) |
| `npm run check:ai` | SI (Claude API) ulanishi va tezligini tekshirish |
| `npm run check:tryon [surat.jpg]` | Virtual kiyintirish (Gemini yoki fal.ai) kalitini tekshirish |
| `npm run tryon:model [ayol]` | Demo uchun sun'iy model surati yaratish (Gemini, pullik) |
| `npm run tryon:prepare -- model.jpg` | Demo rejim uchun tayyor kiyintirish natijalarini yaratish (pullik) |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build va ishga tushirish |
| `npm run typecheck` | TypeScript tekshiruvi |
| `npm test` | Moslashtirish va tahlilchi testlari |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Sxema o'zgarganda yangi migratsiya (dev) |
| `npm run db:seed` | Demo omborni qaytadan yuklash (so'rovlar logi ham tozalanadi) |
| `npm run images:prompts` | Tovar rasmlari uchun prompt'lar ro'yxati (`docs/product-photo-prompts.md`) |
| `npm run images:apply` | `public/products/<sku>.jpg` dagi haqiqiy suratlarni bazaga ulash |
| `npm run images:placeholders` | Seed tovarlari uchun vaqtinchalik SVG rasmlarni qayta yaratish |

## Virtual kiyintirish

Provayderlar (`.env` dagi `TRYON_PROVIDER`): `local` (o'z GPU'ngizda bepul, [tryon-local/README.md](tryon-local/README.md)),
`gemini` yoki `fal` (pullik API). Hech biri ishlamasa, ilova aniq belgilangan "Demo rejim" ni ko'rsatadi.

## Tovar rasmlari

`public/products/*.svg` hozircha vaqtinchalik chizilgan siluetlar. Haqiqiy suratlarni (oq fonda) SKU nomi bilan
qo'ying, masalan `public/products/ks-06.jpg`, keyin `npm run images:apply`. Seed ham suratni avtomatik tanlaydi.
Rasm yaratish uchun tayyor prompt'lar: [docs/product-photo-prompts.md](docs/product-photo-prompts.md). Virtual kiyintirish
(4-bosqich) uchun haqiqiy rasmlar va ochiq URL kerak bo'ladi.
