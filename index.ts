type CascadeAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';

type PropertyDefinition = {
    type: string;
    indexed?: boolean;
    unique?: boolean;
    required?: boolean;
    autoIncrement?: boolean;
    onDelete?: CascadeAction;
    onUpdate?: CascadeAction;
};

/**
 * The authenticated user context passed to all permission filter functions.
 * Supplied by the caller at query time (e.g. from a verified session token).
 */
type PermissionContext = {
    /** null represents an unauthenticated request. Filters still run — they just receive null. */
    userId: string | number | null;
};

/**
 * A function that returns a filter object merged into every query of that
 * operation type.  Returning an empty object ( {} ) means "no restriction".
 */
type RowFilter = (ctx: PermissionContext) => Record<string, any>;

/**
 * Visibility and mutability rules for a single column.
 */
type ColumnPermissions = {
    /**
     * When false the column is stripped from all read results.
     * Defaults to true.
     */
    readable?: boolean;
    /**
     * When false the column is stripped from create / update payloads
     * before they reach the driver, making it effectively immutable by callers.
     * Defaults to true.
     */
    writable?: boolean;
};

/**
 * All permission rules for a schema, covering row-level and column-level security.
 */
type Permissions = {
    /**
     * Row-level filter automatically AND-ed into every read query.
     * Use this to restrict which rows a user can see.
     */
    read?: RowFilter;
    /**
     * Row-level filter applied to create, update, and delete operations.
     * On creates, matching fields are stamped onto the payload (enforcing ownership).
     * On updates/deletes, the filter is AND-ed into the WHERE clause.
     */
    write?: RowFilter;
    /** Per-column visibility / mutability overrides. */
    columns?: {
        [column: string]: ColumnPermissions;
    };
};

/**
 * A named, pre-defined projection of a schema — analogous to a SQL VIEW.
 * Views inherit the schema's base permissions and add further restrictions.
 */
type ViewDefinition = {
    /**
     * Explicit allowlist of columns to include.
     * Omit to inherit all readable columns from the schema's permissions.
     */
    columns?: string[];
    /**
     * Additional row-level filter applied on top of the schema's `read` filter.
     * Both filters are AND-ed together.
     */
    filter?: RowFilter;
};

type Schema = {
    name: string;
    properties: {
        [key: string]: string | PropertyDefinition;
    };
    primaryKey: string;
    /** Row-level and column-level security rules. */
    permissions?: Permissions;
    /** Named projections (views) that expose a restricted shape of this schema. */
    views?: {
        [viewName: string]: ViewDefinition;
    };
};

interface Driver {
    // setup initializes the database with the provided schemas. It should create necessary tables/collections and indexes based on the schema definitions.
    setup(database: string, schemas: Schema[]): Promise<void>;
    // create will insert a record and return the primary key of the newly created record. It should handle auto-incrementing primary keys if specified in the schema.
    create(createSpec: CreateSpec[], database: string, schema: Schema): Promise<number[]>;
    read(readSpec: ReadSpec[], database: string, schema: Schema): Promise<any[]>;
    update(updateSpec: UpdateSpec[], database: string, schema: Schema): Promise<number>;
    delete(deleteSpec: DeleteSpec[], database: string, schema: Schema): Promise<number>;
}

type CreateSpec = {
    schema: string;
    data: any;
};

type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

type JoinColumnMapping = {
    /** Column on the driving (FROM) table. */
    localColumn: string;
    /** Column on the joined table. */
    foreignColumn: string;
};

type JoinSpec = {
    /** Schema name (matches Schema.name) of the table to join. */
    schema: string;
    /**
     * Optional SQL alias for the joined table. Required when joining the same
     * schema more than once. Also used as the key in the reconstructed result
     * object — defaults to the schema name when omitted.
     */
    alias?: string;
    /** Defaults to 'INNER'. */
    type?: JoinType;
    /**
     * One or more column-to-column mappings (get safely quoted, combined with AND),
     * or a raw SQL expression (caller is responsible for escaping any dynamic values).
     */
    on: JoinColumnMapping | JoinColumnMapping[] | string;
};

type ReadSpec = {
    schema: string;
    filter?: any;
    sort?: any;
    limit?: number;
    offset?: number;
    joins?: JoinSpec[];
};

type UpdateSpec = {
    schema: string;
    filter: any;
    update: any;
};

type DeleteSpec = {
    schema: string;
    filter: any;
};

export { Driver, CreateSpec, ReadSpec, UpdateSpec, DeleteSpec, Schema, PropertyDefinition, CascadeAction, JoinType, JoinColumnMapping, JoinSpec, PermissionContext, RowFilter, ColumnPermissions, Permissions, ViewDefinition };
export { createHandler, readHandler, updateHandler, deleteHandler } from './handlers';
export { ProtectedDriver } from './drivers';