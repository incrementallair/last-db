import { Pool, PoolConfig } from 'pg';
import { CascadeAction, CreateSpec, DeleteSpec, Driver, ReadSpec, Schema, UpdateSpec } from '../index';

type SqlFragment = {
	sql: string;
	params: unknown[];
};

const DEFAULT_ADMIN_DB = process.env.PGADMIN_DB ?? 'postgres';

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const tableNameFor = (schema: Schema): string => schema.name.toLowerCase();

type NormalizedProperty = {
	type: string;
	indexed?: boolean;
	unique?: boolean;
	required?: boolean;
	autoIncrement?: boolean;
	onDelete?: CascadeAction;
	onUpdate?: CascadeAction;
};

const normalizeProperty = (property: any): NormalizedProperty => {
	if (typeof property === 'string') {
		return { type: property };
	}

	return {
		type: property?.type ?? 'string',
		indexed: property?.indexed,
		unique: property?.unique,
		required: property?.required,
		autoIncrement: property?.autoIncrement,
		onDelete: property?.onDelete,
		onUpdate: property?.onUpdate,
	};
};

const schemaMap = (schemas: Schema[]): Map<string, Schema> => {
	return new Map(schemas.map((schema) => [schema.name, schema]));
};

const resolveType = (typeName: string, schemasByName: Map<string, Schema>): string => {
	const normalized = typeName.toLowerCase();

	if (schemasByName.has(typeName)) {
		const referenced = schemasByName.get(typeName)!;
		const referencedProperty = normalizeProperty(referenced.properties[referenced.primaryKey]);
		return resolveType(referencedProperty.type, schemasByName);
	}

	switch (normalized) {
		case 'bigint':
			return 'BIGINT';
		case 'integer':
		case 'int':
			return 'INTEGER';
		case 'float':
		case 'double':
		case 'number':
			return 'DOUBLE PRECISION';
		case 'boolean':
		case 'bool':
			return 'BOOLEAN';
		case 'date':
		case 'datetime':
		case 'timestamp':
			return 'TIMESTAMPTZ';
		case 'json':
			return 'JSON';
		case 'jsonb':
			return 'JSONB';
		case 'uuid':
			return 'UUID';
		case 'string':
		default:
			return 'TEXT';
	}
};

const buildCondition = (filter: any, parameterOffset = 1): SqlFragment => {
	if (!filter || Object.keys(filter).length === 0) {
		return { sql: 'TRUE', params: [] };
	}

	const params: unknown[] = [];
	let parameterIndex = parameterOffset;

	const visit = (node: any): string => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) {
			return 'TRUE';
		}

		if (Array.isArray(node.$and)) {
			const parts = node.$and.map((part: any) => `(${visit(part)})`);
			return parts.length > 0 ? parts.join(' AND ') : 'TRUE';
		}

		if (Array.isArray(node.$or)) {
			const parts = node.$or.map((part: any) => `(${visit(part)})`);
			return parts.length > 0 ? parts.join(' OR ') : 'TRUE';
		}

		const parts: string[] = [];

		for (const [field, value] of Object.entries(node)) {
			if (field === '$and' || field === '$or') {
				continue;
			}

			const quotedField = quoteIdent(field);
			if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
				for (const [operator, operand] of Object.entries(value)) {
					switch (operator) {
						case '$eq':
							parts.push(`${quotedField} = $${parameterIndex}`);
							params.push(operand);
							parameterIndex += 1;
							break;
						case '$ne':
							parts.push(`${quotedField} <> $${parameterIndex}`);
							params.push(operand);
							parameterIndex += 1;
							break;
						case '$gt':
							parts.push(`${quotedField} > $${parameterIndex}`);
							params.push(operand);
							parameterIndex += 1;
							break;
						case '$gte':
							parts.push(`${quotedField} >= $${parameterIndex}`);
							params.push(operand);
							parameterIndex += 1;
							break;
						case '$lt':
							parts.push(`${quotedField} < $${parameterIndex}`);
							params.push(operand);
							parameterIndex += 1;
							break;
						case '$lte':
							parts.push(`${quotedField} <= $${parameterIndex}`);
							params.push(operand);
							parameterIndex += 1;
							break;
						case '$in': {
							const values = Array.isArray(operand) ? operand : [operand];
							const placeholders = values.map(() => `$${parameterIndex++}`);
							params.push(...values);
							parts.push(`${quotedField} IN (${placeholders.join(', ')})`);
							break;
						}
						default:
							throw new Error(`Unsupported filter operator: ${operator}`);
					}
				}
			} else {
				parts.push(`${quotedField} = $${parameterIndex}`);
				params.push(value);
				parameterIndex += 1;
			}
		}

		return parts.length > 0 ? parts.join(' AND ') : 'TRUE';
	};

	return { sql: visit(filter), params };
};

class PostgresDriver implements Driver {
	private readonly poolConfig: PoolConfig;

	constructor(poolConfig: PoolConfig = {}) {
		this.poolConfig = poolConfig;
	}

	async setup(database: string, schemas: Schema[]): Promise<void> {
		const adminPool = new Pool({ ...this.poolConfig, database: DEFAULT_ADMIN_DB });

		try {
			const existsResult = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
			if (existsResult.rowCount === 0) {
				await adminPool.query(`CREATE DATABASE ${quoteIdent(database)}`);
			}
		} finally {
			await adminPool.end();
		}

		const dbPool = new Pool({ ...this.poolConfig, database });
		const schemasByName = schemaMap(schemas);

		try {
			for (const schema of schemas) {
				const tableName = quoteIdent(tableNameFor(schema));
				const columns: string[] = [];

				for (const [columnName, property] of Object.entries(schema.properties)) {
					const info = normalizeProperty(property);
					const column = quoteIdent(columnName);
					const isPrimary = columnName === schema.primaryKey;

					let columnDefinition: string;
					if (info.autoIncrement && ['bigint', 'integer', 'int'].includes(info.type.toLowerCase())) {
						columnDefinition = `${column} ${info.type.toLowerCase() === 'bigint' ? 'BIGSERIAL' : 'SERIAL'}`;
					} else {
						columnDefinition = `${column} ${resolveType(info.type, schemasByName)}`;
					}

					if (info.required || isPrimary) {
						columnDefinition += ' NOT NULL';
					}

					if (info.unique) {
						columnDefinition += ' UNIQUE';
					}

					if (isPrimary) {
						columnDefinition += ' PRIMARY KEY';
					}

					columns.push(columnDefinition);
				}

				await dbPool.query(`CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(', ')})`);

				for (const [columnName, property] of Object.entries(schema.properties)) {
					const info = normalizeProperty(property);
					if (!info.indexed) {
						continue;
					}

					const indexName = `${tableNameFor(schema)}_${columnName.toLowerCase()}_idx`;
					await dbPool.query(
						`CREATE INDEX IF NOT EXISTS ${quoteIdent(indexName)} ON ${tableName} (${quoteIdent(columnName)})`,
					);
				}
			}

			// Add foreign key constraints after all tables exist to avoid ordering issues
			for (const schema of schemas) {
				const tableName = quoteIdent(tableNameFor(schema));

				for (const [columnName, property] of Object.entries(schema.properties)) {
					const info = normalizeProperty(property);
					if (!schemasByName.has(info.type)) {
						continue;
					}

					const referenced = schemasByName.get(info.type)!;
					const refTable = quoteIdent(tableNameFor(referenced));
					const refColumn = quoteIdent(referenced.primaryKey);
					const constraintName = quoteIdent(`fk_${tableNameFor(schema)}_${columnName.toLowerCase()}`);

					const onDelete = info.onDelete ?? 'NO ACTION';
					const onUpdate = info.onUpdate ?? 'NO ACTION';

					const constraintExists = await dbPool.query(
						`SELECT 1 FROM information_schema.table_constraints
						 WHERE constraint_type = 'FOREIGN KEY'
						   AND table_name = $1
						   AND constraint_name = $2`,
						[tableNameFor(schema), `fk_${tableNameFor(schema)}_${columnName.toLowerCase()}`],
					);

					if ((constraintExists.rowCount ?? 0) > 0) {
						continue;
					}

					await dbPool.query(
						`ALTER TABLE ${tableName}
						 ADD CONSTRAINT ${constraintName}
						 FOREIGN KEY (${quoteIdent(columnName)})
						 REFERENCES ${refTable} (${refColumn})
						 ON DELETE ${onDelete}
						 ON UPDATE ${onUpdate}`,
					);
				}
			}
		} finally {
			await dbPool.end();
		}
	}

	async create(createSpec: CreateSpec[], database: string, schema: Schema): Promise<number[]> {
		const pool = new Pool({ ...this.poolConfig, database });
		const primaryKey = quoteIdent(schema.primaryKey);
		const tableName = quoteIdent(tableNameFor(schema));
		const ids: number[] = [];

		try {
			for (const spec of createSpec) {
				if (spec.schema !== schema.name) {
					continue;
				}

				const data = spec.data ?? {};
				const keys = Object.keys(data);

				let result;
				if (keys.length === 0) {
					result = await pool.query(`INSERT INTO ${tableName} DEFAULT VALUES RETURNING ${primaryKey}`);
				} else {
					const fields = keys.map(quoteIdent).join(', ');
					const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
					const values = keys.map((key) => data[key]);

					result = await pool.query(
						`INSERT INTO ${tableName} (${fields}) VALUES (${placeholders}) RETURNING ${primaryKey}`,
						values,
					);
				}

				const rawId = result.rows[0]?.[schema.primaryKey];
				const numericId = Number(rawId);
				ids.push(Number.isNaN(numericId) ? 0 : numericId);
			}
		} finally {
			await pool.end();
		}

		return ids;
	}

	async read(readSpec: ReadSpec[], database: string, schema: Schema): Promise<any[]> {
		const pool = new Pool({ ...this.poolConfig, database });
		const tableName = quoteIdent(tableNameFor(schema));
		const records: any[] = [];

		try {
			for (const spec of readSpec) {
				if (spec.schema !== schema.name) {
					continue;
				}

				const where = buildCondition(spec.filter, 1);
				let query = `SELECT * FROM ${tableName} WHERE ${where.sql}`;

				if (spec.sort && typeof spec.sort === 'object') {
					const orderBy = Object.entries(spec.sort as Record<string, unknown>)
						.map(([field, direction]) => {
							const normalized = String(direction).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
							return `${quoteIdent(field)} ${normalized}`;
						})
						.join(', ');

					if (orderBy.length > 0) {
						query += ` ORDER BY ${orderBy}`;
					}
				}

				if (typeof spec.limit === 'number') {
					query += ` LIMIT ${Math.max(0, spec.limit)}`;
				}

				if (typeof spec.offset === 'number') {
					query += ` OFFSET ${Math.max(0, spec.offset)}`;
				}

				const result = await pool.query(query, where.params);
				records.push(...result.rows);
			}
		} finally {
			await pool.end();
		}

		return records;
	}

	async update(updateSpec: UpdateSpec[], database: string, schema: Schema): Promise<number> {
		const pool = new Pool({ ...this.poolConfig, database });
		const tableName = quoteIdent(tableNameFor(schema));
		let updated = 0;

		try {
			for (const spec of updateSpec) {
				if (spec.schema !== schema.name) {
					continue;
				}

				const updates = spec.update ?? {};
				const keys = Object.keys(updates);
				if (keys.length === 0) {
					continue;
				}

				const setParts = keys.map((key, index) => `${quoteIdent(key)} = $${index + 1}`);
				const setValues = keys.map((key) => updates[key]);
				const where = buildCondition(spec.filter, keys.length + 1);
				const query = `UPDATE ${tableName} SET ${setParts.join(', ')} WHERE ${where.sql}`;
				const result = await pool.query(query, [...setValues, ...where.params]);
				updated += result.rowCount ?? 0;
			}
		} finally {
			await pool.end();
		}

		return updated;
	}

	async delete(deleteSpec: DeleteSpec[], database: string, schema: Schema): Promise<number> {
		const pool = new Pool({ ...this.poolConfig, database });
		const tableName = quoteIdent(tableNameFor(schema));
		let deleted = 0;

		try {
			for (const spec of deleteSpec) {
				if (spec.schema !== schema.name) {
					continue;
				}

				const where = buildCondition(spec.filter, 1);
				const query = `DELETE FROM ${tableName} WHERE ${where.sql}`;
				const result = await pool.query(query, where.params);
				deleted += result.rowCount ?? 0;
			}
		} finally {
			await pool.end();
		}

		return deleted;
	}
}

export { PostgresDriver };
