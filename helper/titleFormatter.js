import axios from 'axios';
import { LAST_FM_API_KEY } from "../config.js";


export const getSongMetadataFromLastFM = async (songName) => {
    const apiKey = LAST_FM_API_KEY;

    try {
        const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
            params: {
                method: 'track.search',
                track: songName,
                api_key: apiKey,
                format: 'json',
            },
        });

        console.log(response.data);

        const track = response.data.results.trackmatches.track[0];
        if (track) {
            return {
                title: track.name,
                artist: track.artist,
                url: track.url,
            };
        } else {
            return { error: 'Song not found' };
        }
    } catch (error) {
        console.error('Error fetching song metadata:', error);
        return { error: 'Failed to fetch song metadata' };
    }
};