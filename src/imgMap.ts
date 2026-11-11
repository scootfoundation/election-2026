// Optional override for remote images. The standalone preview builds embed the photos and set window.__IMGS (url -> data URI);
// on the real site it is absent and the original URL is used.
declare global { interface Window { __IMGS?: Record<string, string> } }
export const localImg = (url: string): string => (typeof window !== 'undefined' ? window.__IMGS?.[url] : undefined) ?? url
