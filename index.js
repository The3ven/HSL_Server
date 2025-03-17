import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuid4 } from "uuid";
import { server_port, client_port, db } from "./config.js";
import path from "path";
import fs from "fs";
import os from "os";
import { getDiskUsage } from "./helper/diskUsage.js";
import { formatUptime, formatCurrentTime } from "./helper/timeFormatter.js";
import { exec } from "child_process"; // whach out
import { dbinsert, dbread } from "./services/dbHandler.js";

/* ------------------------------------------------------- ENV ------------------------------------------------------ */


// Check if the folder exists
if (!fs.existsSync("./uploads")) {
	// If the folder does not exist, create it
	fs.mkdirSync("./uploads", { recursive: true });
	console.log('Folder created');
} else {
	console.log('Folder already exists');
}


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

app.get("/status", async (req, res) => {
	const memoryUsage = process.memoryUsage();
	// const cpuUsage = os.loadavg(); // CPU load average over 1, 5, and 15 minutes
	const uptime = os.uptime(); // System uptime in seconds
	const disk = await getDiskUsage("/"); // Root partition disk usage

	return res.status(200).json({
		status: true,
		// cpuUsage,
		memory: {
			total: (os.totalmem() / (1024 * 1024)).toFixed(2) + " MB",
			free: (os.freemem() / (1024 * 1024)).toFixed(2) + " MB",
			used: (memoryUsage.rss / (1024 * 1024)).toFixed(2) + " MB",
		},
		disk,
		uptime: formatUptime(uptime),
		currentTime: formatCurrentTime(),
	});
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

		videoUrl = `/uploads/videos/${videoID}/index.m3u8`;

		const { success, message, error } = await dbinsert(db, "videos_info", {
			title: req.file.originalname.replace(/\.[^.]+$/, ''),
			path: videoUrl,
			size: videoSize,
		});

		if (success) {
			res.json({
				status: success,
				message: "video converted to hls and updated info on db",
				videoUrl: videoUrl,
				videoID: videoID,
				videoSize: videoSize,
			});
		} else {
			return res.status(500).json({
				status: false,
				message: message,
				error: error,
				videoUrl: videoUrl,
				videoID: videoID,
				videoSize: videoSize,
			});
		}

		return fs.rmSync(videoPath); // remove upload video after chunk
	});
});

app.listen(server_port, '0.0.0.0', () => {
	console.log(`App is listening on port ${server_port}`);
});
