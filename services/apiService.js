import axios from 'axios';

class ApiService {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    // GET Request
    async getData(endpoint) {
        try {
            const response = await axios.get(this.baseUrl + endpoint);
            return response.data;
        } catch (error) {
            console.error('Error fetching data:', error);
            throw error;
        }
    }

    // POST Request
    async postData(endpoint, payload) {
        try {
            const response = await axios.post(this.baseUrl + endpoint, payload);
            return response.data;
        } catch (error) {
            console.error('Error posting data:', error);
            throw error;
        }
    }

    // PUT Request
    async updateData(endpoint, payload) {
        try {
            const response = await axios.put(this.baseUrl + endpoint, payload);
            return response.data;
        } catch (error) {
            console.error('Error updating data:', error);
            throw error;
        }
    }

    // DELETE Request
    async deleteData(endpoint) {
        try {
            const response = await axios.delete(this.baseUrl + endpoint);
            return response.data;
        } catch (error) {
            console.error('Error deleting data:', error);
            throw error;
        }
    }
}

export default ApiService;
