import type {
    Driver,
    Schema,
    CreateSpec,
    ReadSpec,
    UpdateSpec,
    DeleteSpec,
    PermissionContext,
} from '../index';

/**
 * Stateless wrapper around a Driver that enforces schema permissions.
 * ctx is passed per-call so this instance is safe to share across requests.
 *
 * - read:  merges schema.permissions.read filter into every ReadSpec
 * - write: merges schema.permissions.write filter into every UpdateSpec / DeleteSpec filter,
 *          and stamps matching fields onto CreateSpec payloads
 * - columns: strips non-readable columns from read results;
 *            strips non-writable columns from create / update payloads
 */
export class ProtectedDriver {
    constructor(private readonly driver: Driver) {}

    setup(database: string, schemas: Schema[]): Promise<void> {
        return this.driver.setup(database, schemas);
    }

    async create(specs: CreateSpec[], database: string, schema: Schema, ctx: PermissionContext): Promise<number[]> {
        const writeFilter = schema.permissions?.write?.(ctx) ?? {};
        const nonWritable = this.getNonWritableColumns(schema);

        const safeSpecs = specs.map((spec) => ({
            ...spec,
            data: {
                ...this.stripColumns(spec.data, nonWritable),
                // Stamp any ownership fields derived from the write filter onto the payload.
                // This prevents callers from spoofing fields like authorId.
                ...writeFilter,
            },
        }));

        return this.driver.create(safeSpecs, database, schema);
    }

    async read(specs: ReadSpec[], database: string, schema: Schema, ctx: PermissionContext): Promise<any[]> {
        const readFilter = schema.permissions?.read?.(ctx) ?? {};
        const nonReadable = this.getNonReadableColumns(schema);

        const safeSpecs = specs.map((spec) => ({
            ...spec,
            filter: { ...spec.filter, ...readFilter },
        }));

        const results = await this.driver.read(safeSpecs, database, schema);

        if (nonReadable.length === 0) return results;
        return results.map((row) => this.stripColumns(row, nonReadable));
    }

    async update(specs: UpdateSpec[], database: string, schema: Schema, ctx: PermissionContext): Promise<number> {
        const writeFilter = schema.permissions?.write?.(ctx) ?? {};
        const nonWritable = this.getNonWritableColumns(schema);

        const safeSpecs = specs.map((spec) => ({
            ...spec,
            filter: { ...spec.filter, ...writeFilter },
            update: this.stripColumns(spec.update, nonWritable),
        }));

        return this.driver.update(safeSpecs, database, schema);
    }

    async delete(specs: DeleteSpec[], database: string, schema: Schema, ctx: PermissionContext): Promise<number> {
        const writeFilter = schema.permissions?.write?.(ctx) ?? {};

        const safeSpecs = specs.map((spec) => ({
            ...spec,
            filter: { ...spec.filter, ...writeFilter },
        }));

        return this.driver.delete(safeSpecs, database, schema);
    }

    // -------------------------------------------------------------------------

    private getNonReadableColumns(schema: Schema): string[] {
        const cols = schema.permissions?.columns ?? {};
        return Object.entries(cols)
            .filter(([, v]) => v.readable === false)
            .map(([k]) => k);
    }

    private getNonWritableColumns(schema: Schema): string[] {
        const cols = schema.permissions?.columns ?? {};
        return Object.entries(cols)
            .filter(([, v]) => v.writable === false)
            .map(([k]) => k);
    }

    private stripColumns(obj: Record<string, any>, columns: string[]): Record<string, any> {
        if (columns.length === 0) return obj;
        const result = { ...obj };
        for (const col of columns) delete result[col];
        return result;
    }
}
