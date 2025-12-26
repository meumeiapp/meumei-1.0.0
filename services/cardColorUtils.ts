import { CreditCard } from '../types';

const DEFAULT_CARD_COLORS: Record<string, string> = {
    'sicredi': '#16a34a',
    'nubank': '#8b2be2',
    'cora': '#0ea5e9',
    'c6': '#0ea5e9',
    'inter': '#ff7a00',
    'itaú': '#ff6b00',
    'itau': '#ff6b00',
    'santander': '#ef4444',
    'bradesco': '#dc2626',
    'caixa': '#2563eb',
    'visa': '#2563eb',
    'master': '#f97316',
    'elo': '#f59e0b',
    'amex': '#22d3ee',
    'hipercard': '#b91c1c'
};

export const CARD_COLOR_SUGGESTIONS: Array<{ label: string; value: string }> = [
    { label: 'Sicredi', value: '#16a34a' },
    { label: 'Nubank', value: '#8b2be2' },
    { label: 'Cora', value: '#0ea5e9' },
    { label: 'Inter', value: '#ff7a00' },
    { label: 'Itaú', value: '#ff6b00' },
    { label: 'Santander', value: '#ef4444' }
];

export const ACCOUNT_COLOR_SUGGESTIONS = [
    { label: 'Azul', value: '#2563eb' },
    { label: 'Turquesa', value: '#0ea5e9' },
    { label: 'Verde', value: '#22c55e' },
    { label: 'Laranja', value: '#f97316' },
    { label: 'Roxo', value: '#a855f7' },
    { label: 'Cinza', value: '#6b7280' }
];

const hexToRgbObject = (hex: string) => {
    const cleaned = hex.replace('#', '');
    const bigint = parseInt(cleaned.length === 3 ? cleaned.repeat(2) : cleaned, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
};

const toHex = (value: number) => value.toString(16).padStart(2, '0');

const rgbToHex = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

export const withAlpha = (hex: string, alpha: number) => {
    const { r, g, b } = hexToRgbObject(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const clamp = (value: number, min = 0, max = 255) => Math.min(Math.max(value, min), max);

export const adjustColor = (hex: string, amount: number) => {
    const { r, g, b } = hexToRgbObject(hex);
    const factor = amount / 100;
    const newR = clamp(Math.round(r + (255 - r) * factor));
    const newG = clamp(Math.round(g + (255 - g) * factor));
    const newB = clamp(Math.round(b + (255 - b) * factor));
    return rgbToHex(newR, newG, newB);
};

export const darkenColor = (hex: string, amount: number) => {
    const { r, g, b } = hexToRgbObject(hex);
    const factor = amount / 100;
    const newR = clamp(Math.round(r * (1 - factor)));
    const newG = clamp(Math.round(g * (1 - factor)));
    const newB = clamp(Math.round(b * (1 - factor)));
    return rgbToHex(newR, newG, newB);
};

export const getDefaultCardColor = (reference?: string) => {
    const lower = (reference || '').toLowerCase();
    const match = Object.entries(DEFAULT_CARD_COLORS).find(([key]) => lower.includes(key));
    return match ? match[1] : '#7c3aed'; 
};

export const getCardColor = (card?: Pick<CreditCard, 'cardColor' | 'name' | 'brand'> | null) => {
    if (!card) return getDefaultCardColor();
    if (card.cardColor) return card.cardColor;
    return getDefaultCardColor(card.name || card.brand);
};

export const getAccountColor = (account?: { color?: string }) => {
    return account?.color || '#0ea5e9';
};

export const getCardGradient = (card?: Pick<CreditCard, 'cardColor' | 'name' | 'brand'> | null) => {
    const base = getCardColor(card);
    return {
        base,
        start: adjustColor(base, 10),
        end: darkenColor(base, 25)
    };
};

export const getBrandIcon = (brand?: string) => {
    const b = (brand || '').toLowerCase();
    if (b.includes('visa')) return 'https://img.icons8.com/color/48/visa.png';
    if (b.includes('master')) return 'https://img.icons8.com/color/48/mastercard.png';
    if (b.includes('elo')) return 'https://img.icons8.com/color/48/elo.png';
    if (b.includes('amex')) return 'https://img.icons8.com/color/48/amex.png';
    if (b.includes('hiper')) return 'https://img.icons8.com/color/48/bank-card-back-side.png';
    return 'https://img.icons8.com/color/48/bank-card-back-side.png';
};
