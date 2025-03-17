import { database } from "./db.js";

export const dbinsert = async (db, collection, data) => {
	if (!data || Object.keys(data).length === 0) {
		console.error("Cannot insert empty data.");
		return { success: false, message: "Empty data provided" };
	}

	let { conn, coll } = await database(db, collection);

	// console.log("conn : ", conn, "coll : ", coll);

	try {
		const result = await coll.insertOne(data);

		// Check if the insert was successful
		if (!result.acknowledged) {
			console.warn("Insert operation not acknowledged by MongoDB.");
			return { success: false, message: "Insert failed" };
		}
		console.log(`Inserted document with ID: ${result.insertedId}`);
		return {
			success: true,
			insertedId: result.insertedId,
			message: "Insert successful",
		};
	} catch (error) {
		console.error("Insert failed:", error);
		return {
			success: false,
			message: "Insert failed",
			error: error.message,
		};
	} finally {
		if (conn) await conn.close();
	}
};

export const dbread = async (db, collection, data) => {
	let { conn, coll } = await database(db, collection);

	console.log("data : ", data);

	if (!data || Object.keys(data).length === 0) {
		console.error("Query cannot be empty.");
		return { success: false, message: "Invalid query provided" };
	}

	if (!coll) {
		console.error("Failed to get collection.");
		return { success: false, message: "Database connection failed" };
	}

	try {
		let response = await coll.findOne(data);
		if (!response) {
			console.warn("No matching document found.");
			return { success: false, message: "No matching document found" };
		}
		console.log("Document found:", response);
		return { success: true, data: response };
	} catch (error) {
		console.error("Error fetching data:", error);
		return {
			success: false,
			message: "Error reading data",
			error: error.message,
		};
	} finally {
		if (conn) await conn.close();
	}
};
