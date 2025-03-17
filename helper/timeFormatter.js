export const formatUptime = (seconds) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	return `${hours}h ${minutes}m ${secs}s`;
};

export const formatCurrentTime = () => {
	const now = new Date();
	return now.toLocaleString("en-US", {
		weekday: "long", // Example: Monday
		year: "numeric",
		month: "long", // Example: January
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true, // Use 12-hour format
		timeZoneName: "short", // Display time zone
	});
};
