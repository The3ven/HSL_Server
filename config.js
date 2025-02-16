import fs from "fs";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const server_port = process.env.SERVER_PORT || 8000;
export const client_port = process.env.CLIENT_PORT || 5173;
export const mongodb_url = process.env.MONGO_URI || "mongodb://localhost:27017";
export const db = process.env.DB || "StreamServer";
