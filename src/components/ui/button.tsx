'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

/* ─── Variant Maps ────────────────────────────────────────────────────── */

const variantStyles = {
  default:
    'bg-ink text-on-primary hover:bg-ink/90 active:scale-[0.97] active:opacity-90',
  secondary:
    'bg-soft-cloud text-ink hover:bg-soft-cloud/80 active:scale-[0.97] active:opacity-90',
  outline:
    'border border-hairline bg-canvas text-ink hover:bg-soft-cloud active:scale-[0.97]',
  destructive:
    'bg-sale text-on-primary hover:bg-sale-deep active:scale-[0.97] active:opacity-90',
  ghost: 'text-ink hover:bg-soft-cloud active:scale-[0.97]',
  link: 'text-ink underline-offset-4 hover:underline',
} as const;

const sizeStyles = {
  default: 'h-12 px-8 text-button-md',
  sm: 'h-9 px-4 text-button-sm',
  lg: 'h-14 px-10 text-button-lg',
  icon: 'h-10 w-10',
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
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-150 ease-in-out focus-ring disabled:pointer-events-none disabled:opacity-50',
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
