import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Custom typography utilities defined in `globals.css` (e.g. `text-button-md`,
 * `text-body-md`). These are FONT-SIZE utilities, but tailwind-merge would
 * otherwise treat them as `text-color` classes and incorrectly strip a real
 * color class such as `text-on-primary` when both appear together.
 *
 * Registering them under the `font-size` group teaches tailwind-merge that
 * they belong to a different conflict group than text colors, so the color
 * class is preserved (fixing dark button text in light mode, etc.).
 */
const CUSTOM_FONT_SIZE_CLASSES = [
  'display-campaign',
  'heading-xl',
  'heading-lg',
  'heading-md',
  'body-md',
  'body-strong',
  'button-lg',
  'button-md',
  'button-sm',
  'link-md',
  'caption-md',
  'caption-sm',
  'utility-xs',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: CUSTOM_FONT_SIZE_CLASSES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
