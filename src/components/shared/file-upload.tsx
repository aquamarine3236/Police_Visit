'use client';

import * as React from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_EXTENSIONS = ['.xlsx'];
const ACCEPTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export interface FileUploadProps {
  /** Called when a valid file is selected. */
  onFileSelect: (file: File) => void;
  /** Called when the file is cleared. */
  onFileClear?: () => void;
  /** Whether the upload is in a loading state. */
  loading?: boolean;
  /** Whether the component is disabled. */
  disabled?: boolean;
  /** Additional CSS classes. */
  className?: string;
}

export function FileUpload({
  onFileSelect,
  onFileClear,
  loading = false,
  disabled = false,
  className,
}: FileUploadProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const validateFile = (f: File): string | null => {
    const extension = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      return 'Chỉ chấp nhận tệp định dạng .xlsx';
    }
    if (f.size > MAX_FILE_SIZE) {
      return `Kích thước tệp vượt quá giới hạn 5MB (hiện tại: ${(f.size / 1024 / 1024).toFixed(1)}MB)`;
    }
    return null;
  };

  const handleFile = (f: File) => {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    onFileSelect(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || loading) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFile(droppedFiles[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled && !loading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input value so the same file can be re-selected
    e.target.value = '';
  };

  const handleClear = () => {
    setFile(null);
    setError(null);
    onFileClear?.();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        className={cn(
          'relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors',
          isDragOver
            ? 'border-ink bg-soft-cloud'
            : 'border-hairline hover:border-stone hover:bg-soft-cloud/50',
          (disabled || loading) && 'cursor-not-allowed opacity-50',
          error && 'border-sale/50',
        )}
        role="button"
        tabIndex={0}
        aria-label="Khu vực tải tệp lên"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(',')}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || loading}
          aria-hidden
        />

        {file ? (
          /* File preview */
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
              <FileSpreadsheet className="h-6 w-6 text-success" />
            </div>
            <div className="text-left">
              <p className="text-body-strong text-ink">{file.name}</p>
              <p className="text-caption-sm text-mute">
                {formatFileSize(file.size)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              disabled={loading}
              className="ml-2 h-8 w-8"
              aria-label="Xóa tệp"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          /* Upload prompt */
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-soft-cloud">
              <Upload className="h-6 w-6 text-mute" />
            </div>
            <div className="text-center">
              <p className="text-body-strong text-ink">
                Kéo và thả tệp vào đây
              </p>
              <p className="text-caption-md text-mute">
                hoặc nhấn để chọn tệp (.xlsx, tối đa 5MB)
              </p>
            </div>
          </>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-canvas/80">
            <svg
              className="h-8 w-8 animate-spin text-ink"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-caption-sm text-sale" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
