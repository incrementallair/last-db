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

type Schema = {
    name: string;
    properties: {
        [key: string]: string | PropertyDefinition;
    };
    primaryKey: string;
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

export { Driver, CreateSpec, ReadSpec, UpdateSpec, DeleteSpec, Schema, PropertyDefinition, CascadeAction, JoinType, JoinColumnMapping, JoinSpec };
export { createHandler, readHandler, updateHandler, deleteHandler } from './handlers';