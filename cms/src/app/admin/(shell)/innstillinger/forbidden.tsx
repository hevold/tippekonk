/**
 * Shared "no access" body for settings pages. The layout already gates the
 * tabs; pages still check the permission themselves (UI hiding is never the
 * only check).
 */
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';

export function SettingsForbidden() {
  return <Alert variant="danger">{t('common.error.forbidden')}</Alert>;
}
