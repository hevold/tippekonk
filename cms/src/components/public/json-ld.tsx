/**
 * Renders one or more JSON-LD objects in a <script type="application/ld+json">.
 * `serializeJsonLd` escapes "<" so user content can never terminate the
 * script element.
 */
import { serializeJsonLd, type JsonLdObject } from '@/server/public/json-ld';

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
