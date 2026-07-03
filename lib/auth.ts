import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getUserByEmail } from '@/lib/data/users';
import { audit } from '@/lib/data/audit';

/**
 * Industry-standard auth via NextAuth (Auth.js):
 *  - JWT session strategy (stateless, scalable)
 *  - Credentials provider with bcrypt-hashed password check
 *  - Users are looked up in the Supabase `users` table.
 *
 * Sign-up is handled by POST /api/auth/register, which inserts a bcrypt-hashed
 * user. The demo account (advocate@adhivakta.ai) is seeded by db-apply.mjs.
 */

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await getUserByEmail(credentials.email.trim());
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.password_hash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          plan: user.plan,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as any).id;
        token.role = (user as any).role;
        token.plan = (user as any).plan;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid;
        (session.user as any).role = token.role;
        (session.user as any).plan = token.plan;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await audit({ userId: (user as any)?.id, action: 'user.login', entity: 'user', entityId: (user as any)?.id });
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
