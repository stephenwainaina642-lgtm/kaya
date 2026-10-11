import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cypress-500 focus:outline-none focus:ring-2 focus:ring-cypress-100 ${className}`}
      {...props}
    />
  ),
);
TextArea.displayName = 'TextArea';
