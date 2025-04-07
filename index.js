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
import { exec, spawn } from "child_process"; // whach out
import { dbinsert, dbread } from "./services/dbHandler.js";
import https from "https";


/* ------------------------------------------------------- ENV ------------------------------------------------------ */


// Check if the folder exists
if (!fs.existsSync("./uploads")) {
	// If the folder does not exist, create it
	fs.mkdirSync("./uploads", { recursive: true });
	console.log('Folder created');
} else {
	console.log('Folder already exists');
}


const privateKey = fs.readFileSync('api_server.key', 'utf8');
const certificate = fs.readFileSync('api_server.cert', 'utf8');


const credentials = { key: privateKey, cert: certificate };


const app = express();

const httpsServer = https.createServer(credentials, app);

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
		name: 'VideoServer',
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


// Wrap the spawn command to manage the process and ensure memory cleanup
const spawnPromise = (cmd) => {
	return new Promise((resolve, reject) => {
		const process = spawn(cmd, { shell: true });

		let stdout = '';
		let stderr = '';

		// Capture stdout data
		process.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		// Capture stderr data
		process.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		// Handle process exit
		process.on('close', (code) => {
			if (code !== 0) {
				reject(`Process exited with code ${code}. stderr: ${stderr}`);
			} else {
				resolve({ stdout, stderr });
			}
		});

		// Handle errors from the spawn process
		process.on('error', (err) => {
			reject(`Failed to start the process: ${err.message}`);
		});

		// Ensure proper cleanup of process on failure or success
		process.on('exit', () => {
			process.kill(); // Explicitly kill the process after execution
		});
	});
};

app.post("/uploadVideo", upload.single("file"), async (req, res) => {
	console.log("file uploaded successfully");
	const videoID = uuid4();
	const videoPath = req.file.path;
	const videoSize = req.file.size;
	const outputPath = `./uploads/videos/${videoID}`;
	const hlsPath = `${outputPath}/index.m3u8`;
	const titleName = req.file.originalname.replace(/\.[^.]+$/, '');
	let videoUrl;
	console.log("hls path ", hlsPath);
	console.log("req.file.originalname : ", req.file.originalname);
	console.log("videoPath : ", videoPath);

	console.log("req.file : ", req.file);

	if (!fs.existsSync(outputPath)) {
		fs.mkdirSync(outputPath, { recursive: true });
	}

	let imagePath = `${outputPath}/${titleName}.jpg`;

	// Extrect Image

	// const extImaCmd = `ffmpeg -i ${videoPath} -frames:v 1 -q:v 2 "${imagePath}"`;

	const extImaCmd = `ffmpeg -i ${videoPath} -ss 00:00:01 -vframes 1 -update 1 -f image2 "${imagePath}"`

	console.log("imagePath : ", imagePath);


	try {
		const result = await spawnPromise(extImaCmd);
		console.log(`stdout: ${result.stdout}`);
		console.log(`stderr: ${result.stderr}`);
	} catch (error) {
		console.error(error);
		imagePath = "";
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

		console.log("imagePath : ", imagePath);

		try {
			fs.accessSync(imagePath, fs.constants.F_OK);
			console.log("Image exists");
		}
		catch (err) {
			console.error("Image not exists error : ", err);
			imagePath = "";
		}


		const { success, message, error } = await dbinsert(db, "videos_info", {
			title: titleName,
			path: videoUrl,
			size: videoSize,
			img: imagePath.substring(1)
		});

		if (success) {
			res.json({
				status: success,
				message: "video converted to hls and updated info on db",
				title: titleName,
				videoUrl: videoUrl,
				videoID: videoID,
				videoSize: videoSize,
				img: imagePath.substring(1)
			});
		} else {
			return res.status(500).json({
				status: false,
				message: message,
				title: titleName,
				error: error,
				videoUrl: videoUrl,
				videoID: videoID,
				videoSize: videoSize,
				img: imagePath.substring(1)
			});
		}

		return fs.rmSync(videoPath); // remove upload video after chunk
	});
});

// app.listen(server_port, '0.0.0.0', () => {
// 	console.log(`App is listening on port ${server_port}`);
// });


httpsServer.listen(server_port, '0.0.0.0', () => {
	console.log(`App is listening on port ${server_port}`);
});