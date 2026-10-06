// Demo paytida zaxira rejimlarni qo'lda yoqish (/admin/holat). Faqat jarayon xotirasida turadi: server qayta
// ishga tushganda hammasi o'chadi, shuning uchun demo tasodifan zaxira rejimda qolib ketmaydi.

export type DemoSettings = {
  /** SI (LLM) chaqirilmaydi: so'rovlar kalit so'z tahlilchisi bilan tushuniladi */
  llmOff: boolean;
  /** Kiyintirish xizmatiga murojaat qilinmaydi: tayyor natija yoki taxminiy ko'rinish ("demo rejim") */
  tryOnDemo: boolean;
};

// globalThis: dev rejimida modul qayta yuklansa ham holat saqlanadi
const g = globalThis as unknown as { __siDemoSettings?: DemoSettings };

export const demoSettings: DemoSettings = (g.__siDemoSettings ??= { llmOff: false, tryOnDemo: false });
