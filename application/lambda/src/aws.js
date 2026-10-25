import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const region = process.env.AWS_REGION;
export const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
export const scheduler = new SchedulerClient({ region });
export const secrets = new SecretsManagerClient({ region });
export const tableName = process.env.SESSION_TABLE_NAME;
export const timezone = process.env.TIMEZONE || "Asia/Kolkata";

export const keyFor = (sub, workDate) => ({ PK: `USER#${sub}`, SK: `SESSION#${workDate}` });
export const scheduleNameFor = (sub, workDate) => `out-${Buffer.from(`${sub}#${workDate}`).toString("base64url")}`.slice(0, 64);
