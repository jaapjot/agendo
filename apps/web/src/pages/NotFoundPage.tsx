import { Compass } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';
import { useDocumentTitle } from '../lib/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState
        icon={Compass}
        title="No encontramos esta página"
        description="Puede que el link esté mal escrito o que la página ya no exista."
        action={<ButtonLink to="/">Volver al inicio</ButtonLink>}
      />
    </div>
  );
}
