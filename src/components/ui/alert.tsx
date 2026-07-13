import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = {
  info: {
    container: 'border-info/25 bg-info-soft text-info',
    Icon: Info,
  },
  success: {
    container: 'border-success/25 bg-success-soft text-success',
    Icon: CheckCircle2,
  },
  warning: {
    container: 'border-warning/25 bg-warning-soft text-warning',
    Icon: AlertTriangle,
  },
  danger: {
    container: 'border-danger/25 bg-danger-soft text-danger',
    Icon: XCircle,
  },
} as const;

export type AlertVariant = keyof typeof alertVariants;

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  /** Override the default variant icon. Pass `null` to hide it. */
  icon?: React.ReactNode;
}

function Alert({
  className,
  variant = 'info',
  title,
  icon,
  children,
  ...props
}: AlertProps) {
  const { container, Icon } = alertVariants[variant];

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-caption-md',
        container,
        className,
      )}
      {...props}
    >
      {icon !== null &&
        (icon ?? <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />)}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-ink/80')}>{children}</div>}
      </div>
    </div>
  );
}

export { Alert };
