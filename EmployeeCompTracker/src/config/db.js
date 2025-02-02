import pkg from 'pg';  // Import the entire pg package
const { Client } = pkg; // Destructure the Client from the imported package

import dotenv from 'dotenv';

dotenv.config();

// Database configuration using environment variables
const dbConfig = {
  host: process.env.DB_HOST,      // PostgreSQL connection info from Render (or other environments)
  user: process.env.DB_USER,      // PostgreSQL user
  password: process.env.DB_PASSWORD,  // Password for the PostgreSQL user
  database: process.env.DB_NAME,  // Name of your PostgreSQL database
  port: process.env.DB_PORT || 5432,  // Default PostgreSQL port (use your correct port if different)
};

// Create and export the database connection
const createConnection = async () => {
  const client = new Client(dbConfig);  // Create the client instance
  try {
    await client.connect();  // Establish the connection
    console.log('Database connected successfully.');
    return client;  // Return the client instance
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1);  // Exit the process if the database connection fails
  }
};

export default createConnection;
