import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Agendo` : 'Agendo · Turnos online';
  }, [title]);
}
