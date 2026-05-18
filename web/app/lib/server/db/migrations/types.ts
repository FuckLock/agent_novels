export interface Migration {
  id: string;
  version: number;
  statements: string[];
}
