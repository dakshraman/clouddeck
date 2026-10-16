import * as bcrypt from "bcryptjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

export interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
}

interface UsersStore {
  users: StoredUser[];
}

const BCRYPT_ROUNDS = 10;

let store: UsersStore | null = null;

function storePath(): string {
  return path.resolve(config.dataDir, "users.json");
}

function seed(): UsersStore {
  const seeded: UsersStore = {
    users: [
      {
        username: config.seedAdmin,
        passwordHash: bcrypt.hashSync(config.seedPassword, BCRYPT_ROUNDS),
        createdAt: new Date().toISOString(),
      },
    ],
  };
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
  return seeded;
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
