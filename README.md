# SI Stilist

Kiyim do'konlari uchun SI stilist va talab analitikasi. Loyiha tavsifi va bosqichlar: [CLAUDE.md](CLAUDE.md).

## Ishga tushirish

Talablar: Node.js 20+, Docker (yoki lokal PostgreSQL 16).

```bash
npm install                 # prisma client ham avtomatik generatsiya qilinadi
cp .env.example .env        # kerak bo'lsa parol va kalitlarni o'zgartiring
docker compose up -d        # PostgreSQL
npm run db:setup            # migratsiyalar + 48 ta demo tovar
npm run dev                 # http://localhost:3000
```

Admin: http://localhost:3000/admin (login istalgan, parol `.env` dagi `ADMIN_PASSWORD`, standart `demo123`).

## Skriptlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build va ishga tushirish |
| `npm run typecheck` | TypeScript tekshiruvi |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Sxema o'zgarganda yangi migratsiya (dev) |
| `npm run db:seed` | Demo omborni qaytadan yuklash (so'rovlar logi ham tozalanadi) |
| `npm run images:placeholders` | Seed tovarlari uchun vaqtinchalik SVG rasmlarni qayta yaratish |

## Tovar rasmlari

`public/products/*.svg` hozircha vaqtinchalik chizilgan siluetlar. Haqiqiy suratlarni (oq fonda, JPG/PNG)
shu papkaga qo'yib, admin orqali yoki CSV importda `image_url` ni yangilang. Virtual kiyintirish
(4-bosqich) uchun haqiqiy rasmlar va ochiq URL kerak bo'ladi.
