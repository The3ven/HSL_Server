import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuid4 } from "uuid";
import { server_port, client_port, apiServer } from "./config.js";
import path from "path";
import fs from "fs";
import os from "os";
import { getDiskUsage } from "./helper/diskUsage.js";
import { formatUptime, formatCurrentTime } from "./helper/timeFormatter.js";
import https from "https";
import ApiService from "./services/apiService.js"
import { getSongMetadataFromLastFM } from "./helper/titleFormatter.js";
import youtubedl from 'youtube-dl-exec';
import { spawnPromise } from "./services/command_executor.js";

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

const apiService = new ApiService(apiServer);

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


app.post("/uploadProfilePicture", upload.single("profileImage"), async (req, res) => {
	console.log("req.body : ", req.body);


	const imagePath = req.file.path;
	const imageSize = req.file.size;
	const imageName = req.file.originalname;
	const userId = req.body.userId;
	const email = req.body.email;
	const userName = req.body.userName;


	console.log("imagePath : ", imagePath);
	console.log("imageSize : ", imageSize);
	console.log("imageName : ", imageName);
	console.log("useId : ", userId);


	if (
		!userName ||
		userName.trim() === "" ||
		!userId ||
		userId.trim() === "" ||
		!email ||
		email.trim() === ""
	) {
		return res.status(400).json({
			status: false,
			message: "Required field missing!",
		});
	}



	// /uploads/profile_pictures/user123/profile.jpg

	const userProfilePath = `./uploads/profile_pictures/${userId}`;
	const finalDestination = imagePath.replace("uploads", `uploads\\profile_pictures\\${userId}`);

	// if dir is exists delete it

	if (fs.existsSync(userProfilePath)) {
		fs.rmSync(userProfilePath, { recursive: true });
	}

	// if dir is not exists make it

	if (!fs.existsSync(userProfilePath)) {
		fs.mkdirSync(userProfilePath, { recursive: true });
	}

	try {
		fs.renameSync(imagePath, finalDestination);
	}
	catch (e) {
		console.log("Error : ", e);
	}


	console.log("finalDestination : ", finalDestination);

	const endpoint = "/updateProfilePicture";

	const payload = {
		userId,
		email,
		userName,
		profilePicture: finalDestination,
	}

	let success, message, error;

	await apiService.postData(endpoint, payload).then((response) => {
		console.log("response : ", response);
		success = response.status;
		message = response.message;
		error = response.error;
	}).catch((error) => {
		console.error("Error : ", error);
		success = false;
		message = "Error in API call";
		error = error;
	});

	console.log("success : ", success);
	console.log("message : ", message);
	console.log("error : ", error);

	if (success) {
		res.status(200).json({
			status: true,
			message,
			profilePicture: finalDestination,
		});
	} else {
		return res.status(500).json({
			status: false,
			message,
		});
	}



});

/**
 * Get video metadata using ffprobe.
 * @param {string} videoPath - Path to the video file.
 * @returns {Promise<{ duration: number, format: string, size: number }>} - Metadata object.
 */
async function getVideoMetadata(videoPath) {
	return new Promise((resolve, reject) => {
		if (!fs.existsSync(videoPath)) {
			return reject(new Error(`Video file not found at path: ${videoPath}`));
		}

		const command = `ffprobe -v error -show_entries format=duration,size,format_name -of json "${videoPath}"`;

		exec(command, (error, stdout, stderr) => {
			if (error) {
				return reject(new Error(`Error executing ffprobe: ${stderr.trim() || error.message}`));
			}

			try {
				const metadata = JSON.parse(stdout).format;

				if (!metadata) {
					return reject(new Error('No metadata found in ffprobe output.'));
				}

				resolve({
					duration: parseFloat(metadata.duration) || 0, // Duration in seconds
					format: metadata.format_name || 'unknown', // Video format (e.g., mp4, mkv)
					size: parseInt(metadata.size, 10) || 0, // File size in bytes
				});
			} catch (parseError) {
				reject(new Error(`Error parsing ffprobe output: ${parseError.message}`));
			}
		});
	});
}


app.post("/uploadVideo", upload.single("video"), async (req, res) => {
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

	let videoTitle = "";

	try {
		const response = await getSongMetadataFromLastFM(titleName);
		console.log("response : ", response);

		if (response.error) {
			console.log("Error : ", response.error);
		}

		if (
			response.title &&
			!["", "undefined", "null", "N/A", "Unknown", "[unknown]"].includes(response.title)
		) {
			videoTitle = response.title;
		}

		if (
			response.artist &&
			!["", "undefined", "null", "N/A", "Unknown", "[unknown]"].includes(response.artist)
		) {
			videoTitle += ` - ${response.artist}`;
		}

		console.log("videoTitle : ", response.title);
		console.log("artist : ", response.artist);
	} catch (error) {
		console.error("Error fetching song metadata:", error);
	}

	if (!videoTitle || videoTitle.trim() === "" || videoTitle === undefined || videoTitle === null || videoTitle.indexOf("undefined") > -1) {
		videoTitle = titleName;
	}


	let imagePath = `${outputPath}/${videoTitle}.jpg`;

	//Extrect Metadata

	let finalmetadata = {
		duration: 0,
		format: "unknown",
		size: 0,
	};

	await getVideoMetadata(videoPath)
		.then((metadata) => {
			console.log('Video Metadata:', metadata);
			finalmetadata = metadata;
		})
		.catch((error) => {
			console.error("Error fetching video metadata:", error);
		});


	console.log("finalmetadata : ", finalmetadata);
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
	try {
		const result = await spawnPromise(ffmpegCommand);

		console.log(`stdout: ${result.stdout}`);
		console.log(`stderr: ${result.stderr}`);

		if (result.stderr) {
			console.error("Error in ffmpeg command:", result.stderr);
			return res.status(500).json({
				status: false,
				message: "Error in ffmpeg command",
				title: titleName,
				videoUrl: "",
				videoID: videoID,
				videoSize: videoSize,
				img: imagePath.substring(1)
			});
		}


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

		const endpoint = "/videos_info";

		const payload =
		{
			title: videoTitle,
			path: videoUrl,
			size: videoSize,
			img: imagePath.substring(1),
			duration: finalmetadata.duration,
			format: finalmetadata.format,
		}

		let success, message, error;

		console.log("payload : ", payload);
		console.log("endpoint : ", endpoint);

		await apiService.postData(endpoint, payload).then((response) => {
			console.log("response : ", response);
			success = response.success;
			message = response.message;
			error = response.error;
		}).catch((error) => {
			console.error("Error : ", error);
			success = false;
			message = "Error in API call";
			error = error;
		});



		console.log("success : ", success);
		console.log("message : ", message);
		console.log("error : ", error);

		if (success) {
			res.status(200).json({
				status: true,
				message,
				title: videoTitle,
				videoUrl: videoUrl,
				videoID: videoID,
				videoSize: videoSize,
				img: imagePath.substring(1)
			});
		} else {
			fs.rmSync(videoPath);
			return res.status(500).json({
				status: false,
				message,
				title: titleName,
				error,
				videoUrl,
				videoID,
				videoSize,
				img: imagePath.substring(1)
			});
		}

		return fs.rmSync(videoPath); // remove upload video after chunk
	} catch (error) {
		console.error("Error executing ffmpeg command:", error);
	}
	// await exec(ffmpegCommand, async (err, stdout, stderr) => {
	// 	if (err) {
	// 		console.log(`exec error: ${err}`);
	// 	}
	// 	console.log(`stdout: ${stdout}`);
	// 	console.log(`stderr: ${stderr}`);

	// videoUrl = `/uploads/videos/${videoID}/index.m3u8`;

	// console.log("imagePath : ", imagePath);

	// try {
	// 	fs.accessSync(imagePath, fs.constants.F_OK);
	// 	console.log("Image exists");
	// }
	// catch (err) {
	// 	console.error("Image not exists error : ", err);
	// 	imagePath = "";
	// }

	// const endpoint = "/videos_info";

	// const payload =
	// {
	// 	title: videoTitle,
	// 	path: videoUrl,
	// 	size: videoSize,
	// 	img: imagePath.substring(1),
	// 	duration: finalmetadata.duration,
	// 	format: finalmetadata.format,
	// }

	// let success, message, error;

	// console.log("payload : ", payload);
	// console.log("endpoint : ", endpoint);

	// await apiService.postData(endpoint, payload).then((response) => {
	// 	console.log("response : ", response);
	// 	success = response.success;
	// 	message = response.message;
	// 	error = response.error;
	// }).catch((error) => {
	// 	console.error("Error : ", error);
	// 	success = false;
	// 	message = "Error in API call";
	// 	error = error;
	// });



	// console.log("success : ", success);
	// console.log("message : ", message);
	// console.log("error : ", error);

	// if (success) {
	// 	res.status(200).json({
	// 		status: true,
	// 		message,
	// 		title: videoTitle,
	// 		videoUrl: videoUrl,
	// 		videoID: videoID,
	// 		videoSize: videoSize,
	// 		img: imagePath.substring(1)
	// 	});
	// } else {
	// 	fs.rmSync(videoPath);
	// 	return res.status(500).json({
	// 		status: false,
	// 		message,
	// 		title: titleName,
	// 		error,
	// 		videoUrl,
	// 		videoID,
	// 		videoSize,
	// 		img: imagePath.substring(1)
	// 	});
	// }

	// return fs.rmSync(videoPath); // remove upload video after chunk
	// });
});

app.post('/download', async (req, res) => {
	const videoURL = req.body.url;
	const youtubeUrlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
	if (!videoURL || !youtubeUrlPattern.test(videoURL)) {
		return res.status(400).json({ error: 'Invalid or missing YouTube URL.' });
	}

	try {
		// Get video info first to determine the file name
		const info = await youtubedl(videoURL, { dumpSingleJson: true });
		const safeTitle = info.title.replace(/[\/\\?%*:|"<>]/g, '-');

		// Find any file that starts with the safeTitle and a dot (any extension)
		const existingFile = fs.readdirSync('./uploads').find(f =>
			f.startsWith(safeTitle + '.') && fs.statSync(path.join('./uploads', f)).isFile()
		);

		if (existingFile) {
			return res.status(200).json({
				message: 'File already exists',
				file: existingFile,
				url: `/uploads/${existingFile}`,
				alreadyExists: true
			});
		}

		// List files before download
		const beforeFiles = new Set(fs.readdirSync('./uploads'));

		const infoPath = path.join('./uploads', 'videoInfo.json');

		// Delete videoInfo.json if it exists
		if (fs.existsSync(infoPath)) {
			fs.unlinkSync(infoPath);
			console.log('Old videoInfo.json deleted.');
		}

		fs.writeFileSync(infoPath, JSON.stringify(info));
		console.log('Video info saved.');

		const outputPath = path.join('./uploads', `${safeTitle}.%(ext)s`);
		await youtubedl.exec('', {
			loadInfoJson: infoPath,
			output: outputPath
		});
		console.log('Video downloaded.');

		// Delete videoInfo.json if it exists
		if (fs.existsSync(infoPath)) {
			fs.unlinkSync(infoPath);
			console.log('New videoInfo.json deleted.');
		}

		// List files after download
		const afterFiles = new Set(fs.readdirSync('./uploads'));
		// Find the new file(s)
		const newFiles = [...afterFiles].filter(x => !beforeFiles.has(x));
		const downloadedFile = newFiles.length > 0 ? newFiles[0] : null;

		if (!downloadedFile) {
			return res.status(500).json({ error: 'Download failed, file not found.' });
		}

		return res.status(201).json({
			message: 'Download completed',
			file: downloadedFile,
			url: `/uploads/${downloadedFile}`,
			alreadyExists: false
		});


		// now transcode this



	} catch (err) {
		console.error('Error:', err);
		return res.status(500).json({ error: 'Failed to download video', details: err.message });
	}
});


app.listen(server_port, '0.0.0.0', () => {
	console.log(`App is listening on port ${server_port}`);
});


// httpsServer.listen(server_port, '0.0.0.0', () => {
// 	console.log(`App is listening on port ${server_port}`);
// });