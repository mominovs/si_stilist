import { prisma } from "@/lib/db";

// Demo oldidan so'rovlar logini tozalash (namunaviy tarix ham o'chadi; qaytarish: npm run db:seed)
export async function POST() {
  const { count } = await prisma.request.deleteMany();
  return Response.json({ deleted: count });
}
