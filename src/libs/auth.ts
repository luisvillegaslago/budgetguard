/**
 * BudgetGuard Authentication Configuration
 *
 * Custom PostgreSQL adapter for NextAuth with PascalCase table mapping.
 * Provides getUserIdOrThrow() for server-side user scoping in all repositories.
 */

import type { AuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import GoogleProvider from 'next-auth/providers/google';
import { query } from '@/services/database/connection';

// ============================================================
// AuthError — Custom error for 401 responses
// ============================================================

export class AuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

// ============================================================
// Custom PostgreSQL Adapter (PascalCase tables)
// ============================================================

interface UserRow {
  UserID: number;
  Email: string;
  Name: string | null;
  Image: string | null;
  EmailVerified: Date | null;
}

interface AccountRow {
  AccountID: number;
  UserID: number;
  Type: string;
  Provider: string;
  ProviderAccountId: string;
  RefreshToken: string | null;
  AccessToken: string | null;
  ExpiresAt: number | null;
  TokenType: string | null;
  Scope: string | null;
  IdToken: string | null;
  SessionState: string | null;
}

interface SessionRow {
  SessionID: number;
  UserID: number;
  SessionToken: string;
  Expires: Date;
}

interface VerificationTokenRow {
  Identifier: string;
  Token: string;
  Expires: Date;
}

function rowToAdapterUser(row: UserRow): AdapterUser {
  return {
    id: String(row.UserID),
    userId: row.UserID,
    email: row.Email,
    emailVerified: row.EmailVerified,
    name: row.Name,
    image: row.Image,
  };
}

function createPgAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, 'id'>) {
      const rows = await query<UserRow>(
        `INSERT INTO "Users" ("Email", "Name", "Image", "EmailVerified")
         VALUES ($1, $2, $3, $4)
         RETURNING "UserID", "Email", "Name", "Image", "EmailVerified"`,
        [user.email, user.name ?? null, user.image ?? null, user.emailVerified ?? null],
      );
      const row = rows[0];
      if (!row) throw new Error('Failed to create user');
      return rowToAdapterUser(row);
    },

    async getUser(id) {
      const rows = await query<UserRow>(
        `SELECT "UserID", "Email", "Name", "Image", "EmailVerified"
         FROM "Users" WHERE "UserID" = $1`,
        [Number(id)],
      );
      return rows[0] ? rowToAdapterUser(rows[0]) : null;
    },

    async getUserByEmail(email) {
      const rows = await query<UserRow>(
        `SELECT "UserID", "Email", "Name", "Image", "EmailVerified"
         FROM "Users" WHERE "Email" = $1`,
        [email],
      );
      return rows[0] ? rowToAdapterUser(rows[0]) : null;
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const rows = await query<UserRow>(
        `SELECT u."UserID", u."Email", u."Name", u."Image", u."EmailVerified"
         FROM "Users" u
         INNER JOIN "Accounts" a ON u."UserID" = a."UserID"
         WHERE a."Provider" = $1 AND a."ProviderAccountId" = $2`,
        [provider, providerAccountId],
      );
      return rows[0] ? rowToAdapterUser(rows[0]) : null;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
      const rows = await query<UserRow>(
        `UPDATE "Users" SET "Name" = COALESCE($2, "Name"), "Email" = COALESCE($3, "Email"),
         "Image" = COALESCE($4, "Image"), "EmailVerified" = COALESCE($5, "EmailVerified")
         WHERE "UserID" = $1
         RETURNING "UserID", "Email", "Name", "Image", "EmailVerified"`,
        [Number(user.id), user.name, user.email, user.image, user.emailVerified],
      );
      const row = rows[0];
      if (!row) throw new Error('Failed to update user');
      return rowToAdapterUser(row);
    },

    async deleteUser(userId) {
      await query(`DELETE FROM "Users" WHERE "UserID" = $1`, [Number(userId)]);
    },

    async linkAccount(account: Record<string, unknown>) {
      await query<AccountRow>(
        `INSERT INTO "Accounts" ("UserID", "Type", "Provider", "ProviderAccountId",
         "RefreshToken", "AccessToken", "ExpiresAt", "TokenType", "Scope", "IdToken", "SessionState")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          Number(account.userId),
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          account.session_state ?? null,
        ],
      );
    },

    async unlinkAccount({ providerAccountId, provider }: { providerAccountId: string; provider: string }) {
      await query(`DELETE FROM "Accounts" WHERE "Provider" = $1 AND "ProviderAccountId" = $2`, [
        provider,
        providerAccountId,
      ]);
    },

    async createSession(session: { userId: string; sessionToken: string; expires: Date }) {
      const rows = await query<SessionRow>(
        `INSERT INTO "Sessions" ("UserID", "SessionToken", "Expires")
         VALUES ($1, $2, $3)
         RETURNING "SessionID", "UserID", "SessionToken", "Expires"`,
        [Number(session.userId), session.sessionToken, session.expires],
      );
      const row = rows[0];
      if (!row) throw new Error('Failed to create session');
      return {
        userId: String(row.UserID),
        sessionToken: row.SessionToken,
        expires: row.Expires,
      };
    },

    async getSessionAndUser(sessionToken) {
      const rows = await query<SessionRow & UserRow>(
        `SELECT s."SessionID", s."UserID", s."SessionToken", s."Expires",
                u."Email", u."Name", u."Image", u."EmailVerified"
         FROM "Sessions" s
         INNER JOIN "Users" u ON s."UserID" = u."UserID"
         WHERE s."SessionToken" = $1`,
        [sessionToken],
      );
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        session: {
          userId: String(row.UserID),
          sessionToken: row.SessionToken,
          expires: row.Expires,
        },
        user: rowToAdapterUser(row),
      };
    },

    async updateSession(session) {
      const rows = await query<SessionRow>(
        `UPDATE "Sessions" SET "Expires" = COALESCE($2, "Expires")
         WHERE "SessionToken" = $1
         RETURNING "SessionID", "UserID", "SessionToken", "Expires"`,
        [session.sessionToken, session.expires],
      );
      if (!rows[0]) return null;
      return {
        userId: String(rows[0].UserID),
        sessionToken: rows[0].SessionToken,
        expires: rows[0].Expires,
      };
    },

    async deleteSession(sessionToken) {
      await query(`DELETE FROM "Sessions" WHERE "SessionToken" = $1`, [sessionToken]);
    },

    async createVerificationToken(token: { identifier: string; token: string; expires: Date }) {
      const rows = await query<VerificationTokenRow>(
        `INSERT INTO "VerificationTokens" ("Identifier", "Token", "Expires")
         VALUES ($1, $2, $3)
         RETURNING "Identifier", "Token", "Expires"`,
        [token.identifier, token.token, token.expires],
      );
      const row = rows[0];
      if (!row) throw new Error('Failed to create verification token');
      return {
        identifier: row.Identifier,
        token: row.Token,
        expires: row.Expires,
      };
    },

    async useVerificationToken({ identifier, token }) {
      const rows = await query<VerificationTokenRow>(
        `DELETE FROM "VerificationTokens"
         WHERE "Identifier" = $1 AND "Token" = $2
         RETURNING "Identifier", "Token", "Expires"`,
        [identifier, token],
      );
      if (!rows[0]) return null;
      return {
        identifier: rows[0].Identifier,
        token: rows[0].Token,
        expires: rows[0].Expires,
      };
    },
  };
}

// ============================================================
// Seed categories for new users
// ============================================================

interface CategoryRow {
  CategoryID: number;
  Name: string;
}

async function assignOrphanedDataToUser(userId: number): Promise<void> {
  const tables = ['Categories', 'Transactions', 'RecurringExpenses', 'TransactionGroups', 'Trips'];
  await Promise.all(
    tables.map((table) => query(`UPDATE "${table}" SET "UserID" = $1 WHERE "UserID" IS NULL`, [userId])),
  );
}

async function seedCategoriesForUser(userId: number): Promise<void> {
  // Insert parent categories
  const incomeParents = await query<CategoryRow>(
    `INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "UserID") VALUES
     ('Nomina', 'income', 'banknote', '#10B981', 1, $1),
     ('Reembolsos', 'income', 'receipt', '#34D399', 2, $1),
     ('Otros Ingresos', 'income', 'plus-circle', '#6EE7B7', 3, $1)
     RETURNING "CategoryID", "Name"`,
    [userId],
  );

  const expenseParents = await query<CategoryRow>(
    `INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "DefaultShared", "UserID") VALUES
     ('Vivienda', 'expense', 'home', '#EF4444', 1, TRUE, $1),
     ('Blanquita', 'expense', 'dog', '#F97316', 2, TRUE, $1),
     ('Trabajo', 'expense', 'briefcase', '#F59E0B', 3, FALSE, $1),
     ('Deporte', 'expense', 'dumbbell', '#EAB308', 4, FALSE, $1),
     ('Paracaidismo', 'expense', 'cloud', '#84CC16', 5, FALSE, $1),
     ('Supermercado', 'expense', 'shopping-cart', '#22C55E', 6, FALSE, $1),
     ('Transporte', 'expense', 'car', '#14B8A6', 7, FALSE, $1),
     ('Restaurante', 'expense', 'utensils', '#06B6D4', 8, FALSE, $1),
     ('Compras', 'expense', 'shopping-bag', '#0EA5E9', 9, FALSE, $1),
     ('Salir', 'expense', 'beer', '#3B82F6', 10, FALSE, $1),
     ('Gastos Extra', 'expense', 'alert-circle', '#6366F1', 11, FALSE, $1),
     ('Viajes', 'expense', 'plane', '#8B5CF6', 12, FALSE, $1),
     ('Anuales', 'expense', 'calendar', '#A855F7', 13, FALSE, $1)
     RETURNING "CategoryID", "Name"`,
    [userId],
  );

  // Build lookup map for parent IDs
  const parentMap = new Map<string, number>();
  [...incomeParents, ...expenseParents].forEach((row) => {
    parentMap.set(row.Name, row.CategoryID);
  });

  // Insert subcategories
  const subcategories: Array<{ parent: string; entries: Array<[string, string, string, number, boolean]> }> = [
    {
      parent: 'Vivienda',
      entries: [
        ['Internet', 'wifi', '#EF4444', 1, true],
        ['Asistenta', 'spray-can', '#EF4444', 2, true],
        ['Calefaccion', 'flame', '#EF4444', 3, true],
        ['Luz', 'zap', '#EF4444', 4, true],
        ['Garaje', 'warehouse', '#EF4444', 5, true],
        ['Comunidad', 'building-2', '#EF4444', 6, true],
        ['Compras Casa', 'package', '#EF4444', 7, true],
        ['Otros', 'alert-circle', '#EF4444', 8, true],
      ],
    },
    {
      parent: 'Salir',
      entries: [
        ['Comida', 'utensils', '#3B82F6', 1, false],
        ['Copas', 'wine', '#3B82F6', 2, false],
        ['Transporte', 'car', '#3B82F6', 3, false],
        ['Ropero', 'shirt', '#3B82F6', 4, false],
        ['Otros', 'alert-circle', '#3B82F6', 5, false],
      ],
    },
    {
      parent: 'Transporte',
      entries: [
        ['Gasolina', 'fuel', '#14B8A6', 1, false],
        ['Peaje', 'landmark', '#14B8A6', 2, false],
        ['Taxi', 'car', '#14B8A6', 3, false],
        ['Parking', 'square-parking', '#14B8A6', 4, false],
        ['Transporte Publico', 'train-front', '#14B8A6', 5, false],
      ],
    },
    {
      parent: 'Deporte',
      entries: [
        ['Padel', 'trophy', '#EAB308', 1, false],
        ['Gimnasio', 'dumbbell', '#EAB308', 2, false],
        ['Carreras', 'flag', '#EAB308', 3, false],
        ['General', 'alert-circle', '#EAB308', 4, false],
      ],
    },
    {
      parent: 'Trabajo',
      entries: [
        ['Seguridad Social', 'shield', '#F59E0B', 1, false],
        ['Impuestos', 'landmark', '#F59E0B', 2, false],
        ['Anthropic', 'cpu', '#F59E0B', 3, false],
        ['General', 'alert-circle', '#F59E0B', 4, false],
      ],
    },
    {
      parent: 'Viajes',
      entries: [
        ['Alojamiento', 'bed', '#8B5CF6', 1, false],
        ['Transporte', 'car', '#8B5CF6', 2, false],
        ['Comida', 'utensils', '#8B5CF6', 3, false],
        ['Restaurante', 'chef-hat', '#8B5CF6', 4, false],
        ['Actividades', 'ticket', '#8B5CF6', 5, false],
        ['Esquí', 'mountain-snow', '#8B5CF6', 6, false],
        ['Otros', 'ellipsis', '#8B5CF6', 7, false],
        ['Skydive', 'cloud', '#8B5CF6', 8, false],
        ['Copas', 'wine', '#8B5CF6', 9, false],
      ],
    },
  ];

  await Promise.all(
    subcategories.map(({ parent, entries }) => {
      const parentId = parentMap.get(parent);
      if (!parentId) return Promise.resolve();

      const values = entries
        .map(
          (_, i) =>
            `($${i * 6 + 1}, 'expense', $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`,
        )
        .join(', ');

      const params = entries.flatMap(([name, icon, color, sortOrder, shared]) => [
        name,
        icon,
        color,
        sortOrder,
        parentId,
        shared,
      ]);

      return query(
        `INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared")
         VALUES ${values}`,
        params,
      );
    }),
  );

  // Set UserID on all seeded subcategories (they inherit from parent lookup)
  await query(`UPDATE "Categories" SET "UserID" = $1 WHERE "UserID" IS NULL`, [userId]);
}

// ============================================================
// NextAuth Configuration
// ============================================================

export const authOptions: AuthOptions = {
  adapter: createPgAdapter(),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
  session: {
    strategy: 'database',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.userId = Number(user.id);
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const userId = Number(user.id);

      // Check for orphaned data (first user inherits existing data)
      const orphanCheck = await query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count FROM "Categories" WHERE "UserID" IS NULL`,
      );
      const hasOrphans = Number(orphanCheck[0]?.count) > 0;

      if (hasOrphans) {
        await assignOrphanedDataToUser(userId);
      } else {
        await seedCategoriesForUser(userId);
      }
    },
  },
};

// ============================================================
// Server-side auth helper — used by ALL repositories
// ============================================================

export async function getUserIdOrThrow(): Promise<number> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) {
    throw new AuthError();
  }
  return session.user.userId;
}
