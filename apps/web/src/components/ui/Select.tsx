import { forwardRef, type SelectHTMLAttributes } from 'react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select
      ref={ref}
      className={`w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink hover:border-[#cfd6d1] focus:border-brass focus:outline-none focus:ring-4 focus:ring-brass/15 ${className}`}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
