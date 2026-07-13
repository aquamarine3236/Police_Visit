import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ErrorMessageProps {
  /** The error message to display. */
  message: string;
  /** Optional retry callback. */
  onRetry?: () => void;
  /** Additional CSS classes. */
  className?: string;
}

export function ErrorMessage({ message, onRetry, className }: ErrorMessageProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-sale/20 bg-sale/5 p-4',
        className,
      )}
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-sale" />
      <div className="flex-1 space-y-2">
        <p className="text-body-md text-sale">{message}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-sale/30 text-sale hover:bg-sale/10"
          >
            Thử lại
          </Button>
        )}
      </div>
    </div>
  );
}
