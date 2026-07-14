'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Popover tối giản (không phụ thuộc thư viện ngoài).
 *
 * - `Popover` là container tương đối, quản lý trạng thái open + đóng khi click
 *   ra ngoài / nhấn Esc.
 * - `PopoverTrigger` là phần tử kích hoạt (mặc định render nút bao quanh
 *   children); click để bật/tắt.
 * - `PopoverContent` là panel nổi, canh dưới trigger.
 */

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopoverContext(component: string): PopoverContextValue {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) {
    throw new Error(`${component} phải được dùng bên trong <Popover>.`);
  }
  return ctx;
}

export interface PopoverProps {
  /** Điều khiển trạng thái mở (controlled). */
  open?: boolean;
  /** Callback khi trạng thái mở thay đổi. */
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function Popover({ open: openProp, onOpenChange, children, className }: PopoverProps) {
  const [openState, setOpenState] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Đóng khi click ra ngoài hoặc nhấn Escape.
  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  return (
    <PopoverContext.Provider value={{ open, setOpen, containerRef }}>
      <div ref={containerRef} className={cn('relative', className)}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
}
Popover.displayName = 'Popover';

export interface PopoverTriggerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Vùng kích hoạt popover. Bấm để bật/tắt panel. Không render thẻ nút để tránh
 * lồng button (children thường đã chứa input/nút riêng).
 */
const PopoverTrigger = React.forwardRef<HTMLDivElement, PopoverTriggerProps>(
  ({ children, ...props }, ref) => {
    return (
      <div ref={ref} {...props}>
        {children}
      </div>
    );
  },
);
PopoverTrigger.displayName = 'PopoverTrigger';

export interface PopoverContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Canh lề ngang của panel so với trigger. */
  align?: 'start' | 'end';
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = 'start', ...props }, ref) => {
    const { open } = usePopoverContext('PopoverContent');
    if (!open) return null;

    return (
      <div
        ref={ref}
        role="dialog"
        className={cn(
          'absolute top-full z-50 mt-2 rounded-md border border-hairline bg-surface shadow-lg',
          align === 'end' ? 'right-0' : 'left-0',
          className,
        )}
        {...props}
      />
    );
  },
);
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent, usePopoverContext };
