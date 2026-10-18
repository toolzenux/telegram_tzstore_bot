'use client';
  import React from 'react';
import { clsx } from 'clsx';
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('tg-card p-4', className)}>{children}</div>;
}
export function PricePill({ children }: { children: React.ReactNode }) {
  return <span className="tight inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">{children}</span>;
}
export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <span className="tight text-xs font-medium text-gray-400">(out of stock)</span>;
  if (stock <= 5) return <span className="tight rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">low • {stock}</span>;
  return <span className="tight rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">in stock • {stock}</span>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-[14px] bg-gray-200/70', className)} />;
}
export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-7 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="max-w-[360px] rounded-2xl bg-black/90 px-4 py-2.5 text-center text-xs sm:text-sm font-medium leading-snug text-white shadow-2xl backdrop-blur-md">
        {msg}
      </div>
    </div>
  );
}
export function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full rounded-[14px] bg-[#4A90D9] px-4 py-3 font-semibold text-white disabled:opacity-50 tg-press">
      {children}
    </button>
  );
}

  export function CatLogo({ logo, emoji, name, size = 44 }: { logo?: string; emoji: string; name: string; size?: number }) {
    const [err, setErr] = React.useState(false);
    if (!logo || err) return <div style={{ fontSize: size * 0.7 }} aria-hidden>{emoji}</div>;
    return <img src={logo} alt={name} width={size} height={size} loading="lazy" onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
