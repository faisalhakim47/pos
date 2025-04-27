import type { Database } from '@/vendor/@antonz/sqlean/dist/sqlean.js';

export type PosFileContext = {
  posFiles: Array<PosFile>;
};

export type PosFile = {
  uid: string;
  sqlite: Database;
};
