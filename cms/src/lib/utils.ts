import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names safely. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function assertNever(value: never, message = 'Uventet verdi'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
