import Image from 'next/image';
import { cn } from '@/lib/utils';

interface PoliceLogoProps {
  /** Rendered pixel size (height). Width scales with the emblem aspect ratio. */
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * Official emblem of the Vietnam People's Public Security (Công an nhân dân).
 * Single source of truth for branding across the whole application.
 */
export function PoliceLogo({ size = 40, className, priority = false }: PoliceLogoProps) {
  return (
    <Image
      src="/police_logo.svg"
      alt="Huy hiệu Công an nhân dân Việt Nam"
      width={size}
      height={size}
      priority={priority}
      className={cn('object-contain', className)}
      style={{ height: size, width: 'auto' }}
    />
  );
}
