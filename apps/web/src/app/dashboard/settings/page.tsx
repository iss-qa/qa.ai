import { redirect } from 'next/navigation';

// Por enquanto Settings so tem a aba Integrações. Quando houver mais
// (Perfis, Time, Notificacoes etc) este page vira um menu.
export default function SettingsRootPage() {
    redirect('/dashboard/settings/integrations');
}
