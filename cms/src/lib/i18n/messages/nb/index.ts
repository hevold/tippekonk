/**
 * Bokmål message registry. Each feature area owns exactly one file in this
 * directory; this index merges them. Do NOT add keys here — add them to the
 * area file you own. Keys are dotted, prefixed by area: 'articles.title'.
 */
import articles from './articles';
import auth from './auth';
import common from './common';
import dashboard from './dashboard';
import editor from './editor';
import integrations from './integrations';
import layout from './layout';
import live from './live';
import media from './media';
import publicMessages from './public';
import settings from './settings';
import taxonomy from './taxonomy';
import users from './users';

const nb: Record<string, string> = {
  ...common,
  ...auth,
  ...dashboard,
  ...articles,
  ...editor,
  ...media,
  ...layout,
  ...taxonomy,
  ...users,
  ...settings,
  ...live,
  ...publicMessages,
  ...integrations,
};

export default nb;
