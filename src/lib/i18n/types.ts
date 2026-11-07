export type Locale = "en" | "id" | "th" | "ms" | "ja" | "ko" | "zh";

export const LOCALES: { id: Locale; label: string; native: string; flag: string }[] = [
  { id: "en", label: "English", native: "English", flag: "🇬🇧" },
  { id: "id", label: "Bahasa Indonesia", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { id: "th", label: "Thai", native: "ไทย", flag: "🇹🇭" },
  { id: "ms", label: "Malay", native: "Bahasa Melayu", flag: "🇲🇾" },
  { id: "ja", label: "Japanese", native: "日本語", flag: "🇯🇵" },
  { id: "ko", label: "Korean", native: "한국어", flag: "🇰🇷" },
  { id: "zh", label: "Chinese", native: "中文", flag: "🇨🇳" },
];

export type { Dict, TranslationKey } from "./en";
