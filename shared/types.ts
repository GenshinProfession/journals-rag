export type UserRole = 'admin' | 'writer';

export type ModelScenario =
  | 'quality_review'
  | 'parser'
  | 'chunking'
  | 'outline'
  | 'literature'
  | 'writing'
  | 'review'
  | 'chart'
  | 'embedding';

export interface ModelCatalogItem {
  id: string;
  displayName: string;
  providerModel: string;
  contextWindow?: number;
  inputPricePer1kCents: number;
  outputPricePer1kCents: number;
  allowedScenarios: ModelScenario[];
}
