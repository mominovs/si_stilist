export function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU").replace(/ /g, " ")} so'm`;
}
