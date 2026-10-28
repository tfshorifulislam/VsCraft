import { argon2id, hash, verify, type HashOptions } from "argon2";

const PASSWORD_HASH_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
};

export const hashPassword = async (plain: string): Promise<string> => {
  return hash(plain, PASSWORD_HASH_OPTIONS);
};

export const verifyPassword = async (hashValue: string, plain: string): Promise<boolean> => {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
};
