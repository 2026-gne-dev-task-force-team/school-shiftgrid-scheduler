import { createPool } from './db.js';
import { createApp } from './app.js';

const pool = createPool();
const app = createApp(pool);
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`우리학교 시간표 서버 :${port}`));
