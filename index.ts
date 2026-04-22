type Schema = {
    name: string;
    properties: {
        [key: string]: any;
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

type ReadSpec = {
    schema: string;
    filter?: any;
    sort?: any;
    limit?: number;
    offset?: number;
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

export { Driver, CreateSpec, ReadSpec, UpdateSpec, DeleteSpec, Schema };