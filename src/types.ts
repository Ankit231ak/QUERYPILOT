export type NavigationPath = 
  | 'query' 
  | 'database-explorer' 
  | 'query-history' 
  | 'settings';

export type SqlDialect = 'SQLite' | 'PostgreSQL' | 'MySQL' | 'MariaDB' | 'SQL Server' | 'Oracle';

export type AIProvider = 'Groq' | 'Gemini' | 'OpenAI' | 'Claude' | 'OpenRouter' | 'Local';

export interface DatabaseConfig {
  id: string;
  name: string;
  dialect: SqlDialect;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  status: 'connected' | 'disconnected';
  isDefault?: boolean;
}

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
  userFeedback?: 'thumbs_up' | 'thumbs_down';
}

export interface AIAnalysisResult {
  feedbackType: 'thumbs_up' | 'thumbs_down' | 'better_suggestion' | 'wrong_result';
  verdict: 'Optimal Query' | 'Improvement Suggested' | 'Potential Syntax Error' | 'Schema Mismatch' | 'Fixed Query Available';
  explanation: string;
  optimizations: string[];
  suggestedSql?: string;
}

export interface ModelRatings {
  [modelId: string]: { up: number; down: number };
}
