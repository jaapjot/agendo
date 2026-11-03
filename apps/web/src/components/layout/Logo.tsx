import { Link } from 'react-router';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
      <img src="/favicon.svg" alt="" className="size-8" />
      <span className="text-lg">Agendo</span>
    </Link>
  );
}
