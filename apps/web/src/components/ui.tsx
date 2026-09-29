'use client';

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { SpinningMark } from './SpinningMark';

export function Button({
  variant = 'primary',
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      className={`btn btn-${variant}`}
      aria-busy={busy || undefined}
      {...rest}
      disabled={rest.disabled || busy}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...p} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className="input" rows={4} {...p} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select className="input" {...p} />;

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning';
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {/* the symbol makes the state readable without color */}
      <span aria-hidden className="notice-icon">
        {tone === 'success' ? '✓' : tone === 'error' ? '✕' : tone === 'warning' ? '!' : 'i'}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="center" role="status">
      <SpinningMark size={56} label={label} />
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'wait' | 'bad' | 'off'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
