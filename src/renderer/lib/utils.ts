import clsx from 'clsx';

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return clsx(...classes);
}

let counter = 0;
export function genId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
