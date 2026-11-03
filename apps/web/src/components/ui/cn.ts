/** Joins class names, skipping falsy values: cn('a', isActive && 'b') -> 'a b' | 'a'. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
