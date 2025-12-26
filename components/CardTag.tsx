import React from 'react';
import { CreditCard } from '../types';
import { getCardColor, withAlpha } from '../services/cardColorUtils';

interface CardTagProps {
    card?: CreditCard | null;
    label?: string;
    className?: string;
    size?: 'sm' | 'md';
    color?: string;
    icon?: React.ReactNode;
}

const CardTag: React.FC<CardTagProps> = ({ 
    card, 
    label, 
    className = '', 
    size = 'sm',
    color,
    icon
}) => {
    const resolvedColor = color || getCardColor(card || undefined);
    const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs';

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border font-semibold ${padding} ${className}`}
            style={{
                color: resolvedColor,
                backgroundColor: withAlpha(resolvedColor, 0.18),
                borderColor: withAlpha(resolvedColor, 0.4),
                borderWidth: 1,
                borderStyle: 'solid'
            }}
        >
            {icon || <span className="w-2 h-2 rounded-full" style={{ backgroundColor: resolvedColor }} aria-hidden="true" />}
            {label || card?.name || 'Cartão'}
        </span>
    );
};

export default CardTag;
