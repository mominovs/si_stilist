# SI Stilist

Kiyim do'konlari uchun SI stilist va talab analitikasi. Loyiha tavsifi va bosqichlar: [CLAUDE.md](CLAUDE.md).

## Ishga tushirish (lokal)

Talablar: [Node.js 20+](https://nodejs.org) va [Git](https://git-scm.com). Docker shart emas.

Windows'da **Command Prompt** (cmd) oching. Buyruqlar System32 ichida emas, loyiha papkasida bajarilishi kerak:

```bash
cd %USERPROFILE%\Documents
git clone -b claude/blissful-ramanujan-y9ta93 https://github.com/mominovs/si_stilist.git
cd si_stilist
npm install
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

Kompyuter qayta yoqilgandan keyin baza o'chgan bo'ladi: `npm run db:start`, keyin `npm run dev`.

Docker bilan ishlamoqchi bo'lsangiz: `docker compose up -d`, `.env` dagi `DATABASE_URL` ni Docker qatoriga
almashtiring va `npm run db:setup`.

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
| `npm run images:placeholders` | Seed tovarlari uchun vaqtinchalik SVG rasmlarni qayta yaratish |

## Tovar rasmlari

`public/products/*.svg` hozircha vaqtinchalik chizilgan siluetlar. Haqiqiy suratlarni (oq fonda, JPG/PNG)
shu papkaga qo'yib, admin orqali yoki CSV importda `image_url` ni yangilang. Virtual kiyintirish
(4-bosqich) uchun haqiqiy rasmlar va ochiq URL kerak bo'ladi.
