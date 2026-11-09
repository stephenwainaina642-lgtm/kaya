import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-faint hover:border-[#cfd6d1] focus:border-brass focus:outline-none focus:ring-4 focus:ring-brass/15 ${className}`}
      {...props}
    />
  ),
);
TextArea.displayName = 'TextArea';
