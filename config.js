import fs from "fs";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const server_port = process.env.SERVER_PORT || 8000;
export const apiServer = process.env.API_SERVER_URL + ":" + process.env.API_SERVER_PORT || "http://localhost:9000";
export const client_port = process.env.CLIENT_PORT || 5173;
export const mongodb_url = process.env.MONGO_URI || "mongodb://localhost:27017";
export const db = process.env.DB || "StreamServer";
export const LAST_FM_API_KEY = process.env.LAST_FM_API_KEY || "";
