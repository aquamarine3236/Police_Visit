'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

/* ─── Variant Maps ────────────────────────────────────────────────────── */

const variantStyles = {
  default:
    'bg-primary text-on-primary shadow-xs hover:bg-primary-hover active:scale-[0.98]',
  gold: 'bg-gold text-on-gold shadow-xs hover:bg-gold-hover active:scale-[0.98]',
  secondary:
    'bg-soft-cloud text-ink hover:bg-hairline-soft active:scale-[0.98]',
  outline:
    'border border-hairline bg-canvas text-ink hover:bg-soft-cloud hover:border-stone active:scale-[0.98]',
  destructive:
    'bg-danger text-on-primary shadow-xs hover:bg-danger-deep active:scale-[0.98]',
  ghost: 'text-ink hover:bg-soft-cloud active:scale-[0.98]',
  link: 'text-primary underline-offset-4 hover:underline',
} as const;

const sizeStyles = {
  default: 'h-10 px-5 text-button-md rounded-md',
  sm: 'h-9 px-3.5 text-button-sm rounded-md',
  lg: 'h-12 px-7 text-button-lg rounded-lg',
  icon: 'h-10 w-10 rounded-md',
} as const;

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'default', asChild = false, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 ease-in-out focus-ring disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
