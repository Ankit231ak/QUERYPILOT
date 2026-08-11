export type NavigationPath = 
  | 'query' 
  | 'database-explorer' 
  | 'query-history' 
  | 'settings';

export interface DatabaseColumn {
  name: string;
  type: string;
  isPk?: boolean;
  isFk?: boolean;
  description?: string;
}

export interface DatabaseTable {
  id: string;
  name: string;
  rowCount: string;
  description?: string;
  columns: DatabaseColumn[];
}

export interface DatabaseSource {
  id: string;
  name: string;
  status: 'connected' | 'disconnected';
  tables: DatabaseTable[];
}

export interface QueryHistoryItem {
  id: string;
  question: string;
  sql: string;
  status: 'Success' | 'Warning' | 'Failed';
  model: string;
  execTime: string;
  rowsCount: number | string;
  date: string;
  timestamp: number;
}
