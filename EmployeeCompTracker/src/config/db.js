import mysql from 'mysql2/promise'; // Use promise-based MySQL
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Database configuration using environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'db-burness-do-user-18914275-0.j.db.ondigitalocean.com',
  user: process.env.DB_USER || 'doadmin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
};

// Create and export the database connection
const createConnection = async () => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('Database connected successfully.');
    return connection;
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1); // Exit the process if the database connection fails
  }
};

export default createConnection;