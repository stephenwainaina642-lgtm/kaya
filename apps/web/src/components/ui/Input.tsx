import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cypress-500 focus:outline-none focus:ring-2 focus:ring-cypress-100 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
