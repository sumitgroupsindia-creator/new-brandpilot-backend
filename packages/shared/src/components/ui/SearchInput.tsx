import { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Input } from './Input';

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center text-[var(--color-ink-subtle)]" aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-[17px] w-[17px] fill-current">
          <path d="M13.16 12.47a5.5 5.5 0 1 1 .7-.7l3.33 3.33a.5.5 0 0 1-.7.7l-3.33-3.33ZM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
        </svg>
      </span>
      <Input className="h-12 rounded-[16px] pl-10 text-base placeholder:text-[var(--color-ink-subtle)]" type="search" {...props} />
    </div>
  );
}
