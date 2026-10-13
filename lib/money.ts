import { Prisma } from '@prisma/client';

export type Dec = Prisma.Decimal;
export type DecLike = Prisma.Decimal | string | number;
export const D = (v: DecLike): Dec => new Prisma.Decimal(v);
export const ZERO: Dec = new Prisma.Decimal(0);
export const sum = (xs: DecLike[]): Dec => xs.reduce<Dec>((a, x) => a.plus(x), ZERO);
export const num = (v: DecLike | null | undefined): number => (v === null || v === undefined ? 0 : D(v).toNumber());
