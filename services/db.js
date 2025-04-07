import { MongoClient } from "mongodb";
import { mongodb_url, db } from "../config.js";

export const database = async (db, collection) => {
	// console.log(
	// 	"db : ",
	// 	db,
	// 	"collection : ",
	// 	collection,
	// 	"mongodb_url : ",
	// 	mongodb_url
	// );
	try {
		let conn = await MongoClient.connect(mongodb_url, {
			// useNewUrlParser: true,
			// useUnifiedTopology: true,
		});

		const coll = await conn.db(db).collection(collection);

		// console.log("conn : ", conn, "coll : ", coll);

		return {
			conn,
			// coll: conn.db(db).collection(collection),
			coll,
		};
	} catch (e) {
		return {};
	}
};
