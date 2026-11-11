// This file gives the server one clock and one id maker so tests can control both.
import { randomUUID } from "node:crypto";

export type Clock = { now(): Date };
export type IdMaker = { newId(): string };

export const systemClock: Clock = { now: () => new Date() };
export const randomIds: IdMaker = { newId: () => randomUUID() };
