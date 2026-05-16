'use client';


interface Variant {
    id: string;
    name: string;
    price_override: number | null;
}

interface VariantSelectorProps {
    variants: Variant[];
    selectedVariantId: string | null;
    onSelect: (variantId: string) => void;
    basePrice: number;
}

export function VariantSelector({ variants, selectedVariantId, onSelect, basePrice }: VariantSelectorProps) {

    if (!variants || variants.length === 0) return null;

    return (
        <div className="space-y-4 mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Select Version</h3>
            <div className="grid grid-cols-1 gap-3">
                {variants.map((v) => {
                    const price = v.price_override !== null ? v.price_override : basePrice;
                    const isSelected = selectedVariantId === v.id;

                    return (
                        <button
                            key={v.id}
                            onClick={() => onSelect(v.id)}
                            className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${isSelected
                                ? 'border-kode01-pink bg-kode01-pink/10 shadow-[0_4px_15px_rgba(255,105,180,0.15)]'
                                : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                                }`}
                        >
                            <span className={`font-bold tracking-wide ${isSelected ? 'text-white' : 'text-white/80'}`}>
                                {v.name}
                            </span>
                            <span className={`font-black tracking-tight text-lg ${isSelected ? 'text-kode01-pink' : 'text-white/70'}`}>
                                ${price}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    );
}
