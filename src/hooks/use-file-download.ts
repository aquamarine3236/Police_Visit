'use client';

import { useCallback, useState } from 'react';

/**
 * Downloads a file from a same-origin URL while exposing a `downloading` flag so
 * the trigger button can show a spinner. Instead of a plain `<a download>` (which
 * gives no feedback during the potentially slow server-side Excel generation),
 * we fetch the response as a blob, then save it via a temporary anchor.
 *
 * The filename is taken from the `Content-Disposition` header the API sets, so
 * the saved file name matches exactly what the download link produced before.
 */
export function useFileDownload() {
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(
    async (url: string, fallbackFilename = 'export.xlsx'): Promise<boolean> => {
      setDownloading(true);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          return false;
        }

        // Parse the server-provided filename from Content-Disposition.
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const filename = match?.[1] ?? fallbackFilename;

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        return true;
      } catch {
        return false;
      } finally {
        setDownloading(false);
      }
    },
    [],
  );

  return { download, downloading };
}
