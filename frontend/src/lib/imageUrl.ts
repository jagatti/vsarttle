export function safeImageUrl(value: string): string {
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("/")) return value;
  return "";
}
