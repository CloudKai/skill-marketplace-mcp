import express from 'express';
import { createHostedApp } from './dist/hosted-http.js';
const app = express();
app.use(createHostedApp());
export default app;
