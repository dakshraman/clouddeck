import * as bcrypt from "bcryptjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

export interface StoredUser {
  username: string;
  email?: string;
  passwordHash: string;
  createdAt: string;
}

interface UsersStore {
  users: StoredUser[];
}

const BCRYPT_ROUNDS = 10;

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let store: UsersStore | null = null;

function storePath(): string {
  return path.resolve(config.dataDir, "users.json");
}

function persist(target: UsersStore): void {
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(target, null, 2)}\n`, "utf8");
}

/**
 * Initialise the store when users.json does not exist yet. With
 * PANEL_SEED_ADMIN + PANEL_SEED_PASSWORD set, the admin account is created
 * immediately (unattended provisioning, e.g. containers or CI). Otherwise the
 * store starts empty and the panel opens the first-run setup wizard.
 */
function seed(): UsersStore {
  if (config.seedAdmin && config.seedPassword) {
    const seeded: UsersStore = {
      users: [
        {
          username: config.seedAdmin,
          passwordHash: bcrypt.hashSync(config.seedPassword, BCRYPT_ROUNDS),
          createdAt: new Date().toISOString(),
        },
      ],
    };
    persist(seeded);
    return seeded;
  }

  const empty: UsersStore = { users: [] };
  persist(empty);
  return empty;
}

function load(): UsersStore {
  if (store) return store;

  const file = storePath();
  let raw: string | null = null;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (raw === null) {
    store = seed();
    return store;
  }

  // A corrupt store surfaces as an error rather than being silently reseeded.
  const parsed = JSON.parse(raw) as UsersStore | null;
  if (!parsed || !Array.isArray(parsed.users)) {
    throw new Error(`Malformed users store at ${file}`);
  }
  store = parsed;
  return store;
}

export function getUser(username: string): StoredUser | null {
  return load().users.find((user) => user.username === username) ?? null;
}

export async function verifyUser(username: string, password: string): Promise<boolean> {
  const user = getUser(username);
  if (!user) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

/** True once at least one account exists — i.e. first-run setup is done. */
export function isSetupComplete(): boolean {
  return load().users.length > 0;
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "username must be 3-32 characters: letters, digits, dot, dash or underscore";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "password must be at least 8 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "password must be at most 72 bytes";
  return null;
}

export function validateEmail(email: string): string | null {
  if (email.length > 254 || !EMAIL_RE.test(email)) return "invalid email address";
  return null;
}

export interface NewUser {
  username: string;
  password: string;
  email?: string;
}

/** Create and persist an account (first-run setup; future: user management). */
export function createUser(input: NewUser): StoredUser {
  const current = load();
  const user: StoredUser = {
    username: input.username,
    passwordHash: bcrypt.hashSync(input.password, BCRYPT_ROUNDS),
    createdAt: new Date().toISOString(),
  };
  if (input.email) {
    user.email = input.email;
  }
  current.users.push(user);
  persist(current);
  return user;
}
