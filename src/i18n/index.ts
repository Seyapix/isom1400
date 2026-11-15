import type { Lang } from '../domain/types.ts';
import { en } from './en.ts';
import type { Dictionary } from './en.ts';
import { zhHK } from './zh-HK.ts';

export type { Dictionary };

export const DICTIONARIES: Record<Lang, Dictionary> = { en, 'zh-HK': zhHK };

export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'zh-HK', { dateStyle: 'long' }).format(date);
}

export function formatDateTime(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'zh-HK', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
