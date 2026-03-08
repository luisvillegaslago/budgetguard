import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      userId: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    userId: number;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}
