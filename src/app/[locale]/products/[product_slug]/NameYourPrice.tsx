'use client';

import React, { useState } from 'react';

interface NameYourPriceProps {
    minPrice: number;
    currentPrice: number;
    onChange: (newPrice: number) => void;
}

export function NameYourPrice({ minPrice, currentPrice, onChange }: NameYourPriceProps) {
    const [inputValue, setInputValue] = useState(currentPrice.toString());

    const handleBlur = () => {
        let val = parseFloat(inputValue);
        if (isNaN(val) || val < minPrice) {
            val = minPrice;
        }
        setInputValue(val.toString());
        onChange(val);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        const numVal = parseFloat(val);
        if (!isNaN(numVal) && numVal >= minPrice) {
            onChange(numVal);
        }
    };

    return (
        <div className="space-y-4 mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Name a fair price</h3>
            <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-white/50">$</span>
                <input
                    type="number"
                    value={inputValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    min={minPrice}
                    step="0.5"
                    className="w-full bg-white/10 border-2 border-white/10 rounded-2xl py-4 pl-10 pr-4 text-xl font-black text-white outline-none focus:border-kode01-pink focus:ring-4 focus:ring-kode01-pink/10 transition-all font-serif tracking-tight placeholder-white/30"
                />
            </div>
            {minPrice > 0 && (
                <p className="text-xs font-bold text-white/40">Minimum is ${minPrice}</p>
            )}
        </div>
    );
}
