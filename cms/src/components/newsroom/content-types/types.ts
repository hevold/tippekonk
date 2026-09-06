/** Serialisable content type row for /admin/innholdstyper (dates dropped, fields re-validated). */
import type { FieldDef } from '@/lib/validation/site';
import type { ContentTypeWithCounts } from '@/server/content-types/queries';

export type ContentTypeDto = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  template: string;
  fields: FieldDef[];
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  articleCount: number;
  fieldCount: number;
};

export function toContentTypeDto(c: ContentTypeWithCounts): ContentTypeDto {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    description: c.description,
    icon: c.icon,
    template: c.template,
    fields: c.fields,
    isDefault: c.isDefault,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    articleCount: c.articleCount,
    fieldCount: c.fieldCount,
  };
}
