import { connect, migrate } from "./db.ts";

const sql = connect(process.env.DATABASE_URL, 1);
await migrate(sql);
await sql.end();
console.log("schema up to date");
