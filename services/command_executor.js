import { spawn } from 'child_process';

/**
 * Executes a shell command using spawn and returns stdout/stderr.
 * @param {string} cmd - The shell command to execute.
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export const spawnPromise = (cmd) => {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, { shell: true });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (err) => {
            reject(new Error(`Failed to start process: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Process exited with code ${code}. stderr: ${stderr}`));
            }
        });
    });
};
