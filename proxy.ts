// Next.js 16 renamed the "middleware" convention to "proxy".
// We reuse NextAuth's middleware to protect the app routes and
// redirect unauthenticated users to /login.
import withAuth from 'next-auth/middleware';

export default withAuth;

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/draft/:path*',
    '/review/:path*',
    '/library/:path*',
    '/esign/:path*',
    '/settings/:path*',
    '/matters/:path*',
    '/profile/:path*',
  ],
};
