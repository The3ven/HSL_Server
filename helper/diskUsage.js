import diskusage from "diskusage";

export const getDiskUsage = async (path = "/") => {
	try {
		const { available, free, total } = await diskusage.check("/");
		return {
			total: (total / (1024 * 1024)).toFixed(2) + " MB",
			free: (free / (1024 * 1024)).toFixed(2) + " MB",
			available: (available / (1024 * 1024)).toFixed(2) + " MB",
		};
	} catch (error) {
		return { error: error.message };
	}
};
