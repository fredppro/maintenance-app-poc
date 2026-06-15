import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

const nextIntlMiddleware = createMiddleware(routing);

export const proxy = nextIntlMiddleware;

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(pt-pt|en)/:path*']
};
