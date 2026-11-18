import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'secondary' | 'outline';
  size?: 'default' | 'icon';
};

export function Button({ className = '', variant = 'default', size = 'default', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`landing-button ${className}`} data-variant={variant} data-size={size} {...props} />;
}
