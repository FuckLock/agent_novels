import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const schemaMigrations = sqliteTable(
  'schema_migrations',
  {
    id: text('id').primaryKey(),
    migrationId: text('migration_id').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    status: text('status').notNull(),
    detailsJson: text('details_json').notNull(),
    appliedAt: integer('applied_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    migrationIdIdx: uniqueIndex('schema_migrations_migration_id_idx').on(table.migrationId),
  }),
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    relativePath: text('relative_path').notNull(),
    sha256: text('sha256').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sourceType: text('source_type').notNull(),
    objectType: text('object_type'),
    objectId: text('object_id'),
    referenceCount: integer('reference_count').notNull().default(0),
    missing: integer('missing').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    shaIdx: index('artifacts_sha256_idx').on(table.sha256),
    objectIdx: index('artifacts_object_idx').on(table.objectType, table.objectId),
  }),
);

export const runtimeChecks = sqliteTable(
  'runtime_checks',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull(),
    trigger: text('trigger').notNull(),
    dataRoot: text('data_root').notNull(),
    databasePath: text('database_path').notNull(),
    artifactsRoot: text('artifacts_root').notNull(),
    checksJson: text('checks_json').notNull(),
    summaryJson: text('summary_json').notNull(),
    startedAt: integer('started_at').notNull(),
    completedAt: integer('completed_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    statusIdx: index('runtime_checks_status_idx').on(table.status),
    completedAtIdx: index('runtime_checks_completed_at_idx').on(table.completedAt),
  }),
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').notNull().default(''),
    style: text('style').notNull().default(''),
    ratio: text('ratio').notNull().default(''),
    summary: text('summary').notNull().default(''),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    chapterCount: integer('chapter_count').notNull().default(0),
    scriptCount: integer('script_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    nameIdx: uniqueIndex('projects_name_idx').on(table.name),
    statusIdx: index('projects_status_idx').on(table.status),
  }),
);

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeIndex: integer('episode_index').notNull(),
    title: text('title').notNull().default(''),
    status: text('status').notNull().default('draft'),
    revision: integer('revision').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    projectEpisodeIdx: uniqueIndex('episodes_project_episode_idx').on(table.projectId, table.episodeIndex),
  }),
);

export const operators = sqliteTable('operators', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('owner'),
  accessMode: text('access_mode').notNull().default('localhost'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const accessCredentials = sqliteTable(
  'access_credentials',
  {
    id: text('id').primaryKey(),
    operatorId: text('operator_id').notNull().references(() => operators.id),
    label: text('label').notNull(),
    tokenHash: text('token_hash').notNull(),
    accessMode: text('access_mode').notNull(),
    enabled: integer('enabled').notNull().default(1),
    lastUsedAt: integer('last_used_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('access_credentials_token_hash_idx').on(table.tokenHash),
  }),
);

export const secretRefs = sqliteTable(
  'secret_refs',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    scope: text('scope').notNull(),
    label: text('label').notNull(),
    secretPreview: text('secret_preview').notNull().default(''),
    secretDigest: text('secret_digest').notNull().default(''),
    secretCiphertext: text('secret_ciphertext').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    providerScopeIdx: index('secret_refs_provider_scope_idx').on(table.provider, table.scope),
  }),
);

export const providerConfigs = sqliteTable(
  'provider_configs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    baseUrl: text('base_url').notNull().default(''),
    enabled: integer('enabled').notNull().default(1),
    status: text('status').notNull().default('capability_unknown'),
    secretRefId: text('secret_ref_id').references(() => secretRefs.id),
    capabilitiesJson: text('capabilities_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    providerTypeIdx: uniqueIndex('provider_configs_name_type_base_idx').on(table.name, table.type, table.baseUrl),
  }),
);

export const modelConfigs = sqliteTable(
  'model_configs',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull().references(() => providerConfigs.id),
    modelId: text('model_id').notNull(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    mode: text('mode'),
    adapter: text('adapter'),
    enabled: integer('enabled').notNull().default(1),
    isDefault: integer('is_default').notNull().default(0),
    apiJson: text('api_json').notNull().default('{}'),
    defaultParamsJson: text('default_params_json').notNull().default('{}'),
    capabilitiesJson: text('capabilities_json').notNull().default('{}'),
    requestTemplateJson: text('request_template_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    modelTypeIdx: uniqueIndex('model_configs_type_model_id_idx').on(table.type, table.modelId),
    providerIdx: index('model_configs_provider_idx').on(table.providerId),
  }),
);

export const skillVersions = sqliteTable(
  'skill_versions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    version: text('version').notNull(),
    status: text('status').notNull().default('active'),
    path: text('path').notNull(),
    checksum: text('checksum').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    skillKeyIdx: uniqueIndex('skill_versions_name_version_path_idx').on(table.name, table.version, table.path),
  }),
);

export const schema = {
  schemaMigrations,
  artifacts,
  runtimeChecks,
  projects,
  episodes,
  operators,
  accessCredentials,
  secretRefs,
  providerConfigs,
  modelConfigs,
  skillVersions,
};
