import type { Request, Response } from 'express';
import type { Schema, CreateSpec, ReadSpec, UpdateSpec, DeleteSpec, PermissionContext } from '../index';
import { ProtectedDriver } from '../drivers';

const resolveSchema = (schemaName: string, schemas: Schema[]): Schema | undefined =>
    schemas.find((s) => s.name === schemaName);

const createHandler = (driver: ProtectedDriver, database: string, schemas: Schema[], getCtx: (req: Request) => PermissionContext) => {
    return async (req: Request, res: Response): Promise<void> => {
        const specs: CreateSpec[] = Array.isArray(req.body) ? req.body : [req.body];
        const schema = resolveSchema(specs[0]?.schema, schemas);
        if (!schema) {
            res.status(400).json({ error: `Unknown schema: ${specs[0]?.schema}` });
            return;
        }
        const ids = await driver.create(specs, database, schema, getCtx(req));
        res.status(201).json({ ids });
    };
};

const readHandler = (driver: ProtectedDriver, database: string, schemas: Schema[], getCtx: (req: Request) => PermissionContext) => {
    return async (req: Request, res: Response): Promise<void> => {
        const specs: ReadSpec[] = Array.isArray(req.body) ? req.body : [req.body];
        const schema = resolveSchema(specs[0]?.schema, schemas);
        if (!schema) {
            res.status(400).json({ error: `Unknown schema: ${specs[0]?.schema}` });
            return;
        }
        const records = await driver.read(specs, database, schema, getCtx(req));
        res.status(200).json(records);
    };
};

const updateHandler = (driver: ProtectedDriver, database: string, schemas: Schema[], getCtx: (req: Request) => PermissionContext) => {
    return async (req: Request, res: Response): Promise<void> => {
        const specs: UpdateSpec[] = Array.isArray(req.body) ? req.body : [req.body];
        const schema = resolveSchema(specs[0]?.schema, schemas);
        if (!schema) {
            res.status(400).json({ error: `Unknown schema: ${specs[0]?.schema}` });
            return;
        }
        const count = await driver.update(specs, database, schema, getCtx(req));
        res.status(200).json({ updated: count });
    };
};

const deleteHandler = (driver: ProtectedDriver, database: string, schemas: Schema[], getCtx: (req: Request) => PermissionContext) => {
    return async (req: Request, res: Response): Promise<void> => {
        const specs: DeleteSpec[] = Array.isArray(req.body) ? req.body : [req.body];
        const schema = resolveSchema(specs[0]?.schema, schemas);
        if (!schema) {
            res.status(400).json({ error: `Unknown schema: ${specs[0]?.schema}` });
            return;
        }
        const count = await driver.delete(specs, database, schema, getCtx(req));
        res.status(200).json({ deleted: count });
    };
};

export { createHandler, readHandler, updateHandler, deleteHandler };
