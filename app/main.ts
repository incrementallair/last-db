import { PostgresDriver } from '../drivers';
import { schemas } from './schema';

const createAppDriver = () => {
	return new PostgresDriver();
};

const setupAppDatabase = async (database: string): Promise<void> => {
	const driver = createAppDriver();
	await driver.setup(database, schemas);
};

export { createAppDriver, setupAppDatabase };
