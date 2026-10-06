// Suhbat konteksti: "Endi shuning arzonrog'ini ko'rsat" kabi davom gaplari oldingi so'rov shartlarini saqlaydi.
// Deterministik: zaxira tahlilchi uchun to'liq, LLM uchun xavfsizlik to'ri sifatida ishlatiladi.

import { detectFollowUp } from "./keywords";
import type { ParsedQuery } from "./schema";

type Tier = NonNullable<ParsedQuery["narx_darajasi"]>;
const TIERS: Tier[] = ["arzon", "orta", "qimmat"];

function step(tier: Tier | null, dir: -1 | 1): Tier {
  if (!tier) return dir < 0 ? "arzon" : "qimmat";
  return TIERS[Math.max(0, Math.min(2, TIERS.indexOf(tier) + dir))];
}

/**
 * Yangi so'rovni oldingisi bilan birlashtiradi. Yangi so'rovda boshqa kategoriya aytilgan bo'lsa, bu yangi mavzu:
 * oldingi shartlar olinmaydi. Aks holda aytilmagan maydonlar oldingi so'rovdan olinadi, aytilganlari almashtiriladi.
 */
export function mergeWithContext(prev: ParsedQuery | null, next: ParsedQuery, text: string): ParsedQuery {
  if (!prev) return next;
  if (next.kategoriya && prev.kategoriya && next.kategoriya !== prev.kategoriya) return next;

  const rel = detectFollowUp(text);
  let narx = next.narx_darajasi ?? prev.narx_darajasi;
  if (rel.cheaper) narx = step(prev.narx_darajasi, -1);
  else if (rel.pricier) narx = step(prev.narx_darajasi, 1);

  const exclude = [...new Set([...prev.rang_istisno, ...next.rang_istisno])].filter((c) => !next.ranglar.includes(c));
  return {
    kategoriya: next.kategoriya ?? prev.kategoriya,
    jins: next.jins ?? prev.jins,
    ranglar: next.ranglar.length ? next.ranglar : prev.ranglar.filter((c) => !exclude.includes(c)),
    rang_istisno: exclude,
    uslub: next.uslub.length ? next.uslub : prev.uslub,
    maqsad: next.maqsad ?? prev.maqsad,
    narx_darajasi: narx,
    // "Arzonrog'i" deyilsa, oldingi byudjet chegarasi ham saqlanadi
    narx_max: next.narx_max ?? prev.narx_max,
    olcham: next.olcham ?? prev.olcham,
    mavsum: next.mavsum ?? prev.mavsum,
    izoh: next.izoh,
  };
}
