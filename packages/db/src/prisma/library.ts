import { db } from "./db.js";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Every operation is scoped by the authenticated owner, including mutations. */
export const libraryRepository = {
  list(ownerId: string) {
    return db
      .orm!.public!.LibraryItem.where({ ownerId })
      .select("id", "name", "updatedAt")
      .orderBy((i) => i.updatedAt.desc())
      .all();
  },
  get(ownerId: string, id: string) {
    return db.orm!.public!.LibraryItem.where({ ownerId, id }).first();
  },
  create(ownerId: string, name: string, data: unknown) {
    return db.orm!.public!.LibraryItem.create({
      ownerId,
      name,
      data: data as Json,
    });
  },
  async rename(ownerId: string, id: string, name: string) {
    return db.orm!.public!.LibraryItem.where({ ownerId, id }).update({ name });
  },
  async remove(ownerId: string, id: string) {
    return db.orm!.public!.LibraryItem.where({ ownerId, id }).delete();
  },
};
