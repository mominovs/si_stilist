import QRCode from "qrcode";

/** Matn uchun QR kod (SVG belgisi). Serverda yasaladi, internet kerak emas */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
