import { database } from "./db.js";

export const insert = async (db, collection, data) => {
	// console.log("db : ", db, "collection : ", collection, "data : ", data);
	let { conn, coll } = await database(db, collection);
	// console.log("conn : ", conn, "coll : ", coll);

	try {
		await coll.insertOne(data);
		return true;
	} catch (error) {
		return false;
	} finally {
		if (conn) {
			await conn.close();
		}
	}
};

export const updateviolant = async (db, collection, data) => {
	let { conn, coll } = await database(db, collection);
	try {
		await coll.updateOne(data);
		return true;
	} catch (error) {
		return false;
	} finally {
		if (conn) {
			await conn.close();
		}
	}
};

export const read = async (db, collection, data) => {
	let { conn, coll } = await database(db, collection);

	console.log("data : ", data);

	if (!coll) {
		console.error("❌ Failed to get data");
		return null;
	}

	try {
		let response = await coll.findOne(data);
		console.log("response : ", response);
		return response;
	} catch (error) {
		console.log(`error : ${error}`);
	} finally {
		if (conn) {
			await conn.close();
		}
	}
};

export const readAll = async (db, collectionName) => {
	const { conn, coll } = await database(db, collectionName);

	if (!coll) {
		console.error("❌ Failed to get collection");
		return [];
	}

	try {
		const data = await coll.find({}).toArray(); // Fetch all documents
		console.log(
			`✅ Retrieved ${data.length} documents from ${collectionName}`
		);
		return data;
	} catch (error) {
		console.error("❌ Error fetching documents:", error);
		return [];
	} finally {
		if (conn) await conn.close(); // Close the connection after query
	}
};
