// Mijoz va server uchun umumiy: davr filtrlari (bazaga bog'liq emas, brauzerga ham import qilinadi)
export const PERIODS = { bugun: "Bugun", "7k": "7 kun", "30k": "30 kun", hammasi: "Hammasi" } as const;
export type Period = keyof typeof PERIODS;

export function parsePeriod(value: string | null | undefined): Period {
  return value && value in PERIODS ? (value as Period) : "7k";
}
