import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuid4 } from "uuid";
import { server_port, client_port, db } from "./config.js";
import path from "path";
import fs from "fs";
import { exec } from "child_process"; // whach out
import { insert, readAll, read } from "./services/dbHandler.js";

/* ------------------------------------------------------- ENV ------------------------------------------------------ */

const app = express();

// multer middleware

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, "./uploads");
	},
	filename: (req, file, cb) => {
		cb(
			null,
			file.fieldname + "-" + uuid4() + path.extname(file.originalname)
		);
	},
});

// multer configuration

const upload = multer({ storage: storage });

app.use(
	cors({
		origin: [
			`http://localhost:${server_port}`,
			`http://localhost:${client_port}`,
		],
		credentials: true,
	})
);

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*"); // watch it
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept"
	);
	next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
	return res.json({ message: "Hello, World!" });
});

app.get("/getVideoslist", async (req, res) => {
	// console.log("req : ", req);
	try {
		const data = await readAll(db, "videos_info");

		// console.log("data : ", data);

		if (!data) {
			return res.status(404).json({ message: "Noting there!" });
		}

		return res.status(200).json({
			success: true,
			Message: `Retrieved ${data.length} documents`,
			count: data.length,
			data: data,
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Internal Server Error",
			error: error.message,
		});
	}
});

app.get("/getVideosPathByname", async (req, res) => {
	// console.log("req : ", req);
	try {
		const { title } = req.query;

		console.log("title : ", title);

		const data = await read(db, "videos_info", { title: title });

		console.log("data : ", data);

		if (!data) {
			return res.status(404).json({ message: "Noting there!" });
		}

		return res.status(200).json({
			success: true,
			Message: `data retrieved`,
			data: data,
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Internal Server Error",
			error: error.message,
		});
	}
});

app.post("/uploadVideo", upload.single("file"), async (req, res) => {
	console.log("file uploaded successfully");
	const videoID = uuid4();
	const videoPath = req.file.path;
	const videoSize = req.file.size;
	const outputPath = `./uploads/videos/${videoID}`;
	const hlsPath = `${outputPath}/index.m3u8`;
	let videoUrl;
	console.log("hls path ", hlsPath);
	console.log("req.file.originalname : ", req.file.originalname);
	console.log("req.file : ", req.file);

	if (!fs.existsSync(outputPath)) {
		fs.mkdirSync(outputPath, { recursive: true });
	}

	// ffmpeg

	const ffmpegCommand = `ffmpeg -i ${videoPath} -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 ${hlsPath}`;

	// no queue becaus eof POC, not to be use in production

	await exec(ffmpegCommand, async (err, stdout, stderr) => {
		if (err) {
			console.log(`exec error: ${err}`);
		}
		console.log(`stdout: ${stdout}`);
		console.log(`stderr: ${stderr}`);

		videoUrl = `http://localhost:${server_port}/videos/${videoID}/index.m3u8`;

		await insert(db, "videos_info", {
			title: req.file.originalname,
			path: videoUrl,
			size: videoSize,
		});
		res.json({
			message: "video converted to hls",
			videoUrl: videoUrl,
			videoID: videoID,
			videoSize: videoSize,
		});

		return fs.rmSync(videoPath); // remove upload video after chunk
	});
});

app.listen(server_port, () => {
	console.log(`App is listening on port ${server_port}`);
});
