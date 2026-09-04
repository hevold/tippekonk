/**
 * ContentDoc → static HTML string, for RSS full-content feeds and the JSON
 * API. Uses the same React renderer as the public page so markup never
 * diverges. Note: `react-dom/server` is meant for route handlers and server
 * actions, not for React Server Components — call this from `route.ts`
 * files or services, not from page components.
 */
import { renderToStaticMarkup } from 'react-dom/server';

import { renderDoc, type RenderContext } from './render';
import type { ContentDoc } from './types';

export function docToHtml(doc: ContentDoc, ctx: RenderContext): string {
  return renderToStaticMarkup(renderDoc(doc, ctx));
}
