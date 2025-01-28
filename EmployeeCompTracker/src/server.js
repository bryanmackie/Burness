import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import createConnection from './config/db.js'; // Import the database connection

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, '../public')));

// Parse JSON request bodies
app.use(bodyParser.json());

// Helper function to handle database errors
const handleDatabaseError = (res, error) => {
  console.error('Database error:', error);
  res.status(500).json({ success: false, message: 'Internal server error.' });
};

// Initialize the database connection and start the server
const startServer = async () => {
  try {
    const connection = await createConnection(); // Create the database connection
    console.log('Database connected successfully.');

    // Routes

    // Get all employees
    app.get('/api/employees', async (req, res) => {
      try {
        const [results] = await connection.execute('SELECT first_name, last_name FROM latest_employee_data');
        res.status(200).json({ success: true, data: results });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Get first names by last name
    app.get('/api/first-names/:last_name', async (req, res) => {
      const { last_name } = req.params;
      try {
        const [results] = await connection.execute(
          'SELECT first_name FROM latest_employee_data WHERE last_name = ?',
          [last_name]
        );
        res.status(200).json({ success: true, data: results });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Update employee compensation
    app.post('/update', async (req, res) => {
      const { first_name, last_name, ...updates } = req.body;

      if (!first_name || !last_name) {
        return res.status(400).json({ success: false, message: 'First and Last Name are required.' });
      }

      try {
        // Construct the SET clause dynamically
        const setClause = Object.keys(updates)
          .map((key) => `${key} = ?`)
          .join(', ');

        // Extract values for the SET clause
        const setValues = Object.values(updates);

        // Combine all values for the query (SET values + WHERE values)
        const queryValues = [...setValues, first_name, last_name];

        // Execute the UPDATE query
        const [updateResult] = await connection.execute(
          `UPDATE employee_salary SET ${setClause} WHERE first_name = ? AND last_name = ?`,
          queryValues
        );

        if (updateResult.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        // Insert into historical_salary_changes
        await connection.execute(
          'INSERT INTO historical_salary_changes (first_name, last_name, title, salary, date_salary_set) VALUES (?, ?, ?, ?, ?)',
          [first_name, last_name, updates.title, updates.salary, updates.date_salary_set]
        );

        // Insert into historical_salary_comments
        await connection.execute(
          'INSERT INTO historical_salary_comments (first_name, last_name, title, comment_logged, comment_date) VALUES (?, ?, ?, ?, ?)',
          [first_name, last_name, updates.title, updates.comment_logged, updates.comment_date]
        );

        // Insert into historical_bonuses
        await connection.execute(
          'INSERT INTO historical_bonuses (first_name, last_name, title, bonus, bonus_year) VALUES (?, ?, ?, ?, ?)',
          [first_name, last_name, updates.title, updates.bonus, updates.bonus_year]
        );

        // Trigger pushInc to update latest_employee_data
        await connection.execute('INSERT INTO pushInc (first_name, last_name) VALUES (?, ?)', [first_name, last_name]);

        res.status(200).json({ success: true, message: 'Record updated and historical data inserted successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Add a new employee
    app.post('/add-employee', async (req, res) => {
      const { add_first_name, add_last_name } = req.body;

      if (!add_first_name || !add_last_name) {
        return res.status(400).json({ success: false, message: 'First and Last Name are required.' });
      }

      try {
        // Insert into employee_salary
        await connection.execute(
          'INSERT INTO employee_salary (first_name, last_name) VALUES (?, ?)',
          [add_first_name, add_last_name]
        );

        // Trigger pushInc to update latest_employee_data
        await connection.execute('INSERT INTO pushInc (first_name, last_name) VALUES (?, ?)', [add_first_name, add_last_name]);

        res.status(200).json({ success: true, message: 'Employee added successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Delete an employee
    app.post('/delete-employee', async (req, res) => {
      const { delete_first_name, delete_last_name } = req.body;

      if (!delete_first_name || !delete_last_name) {
        return res.status(400).json({ success: false, message: 'First and Last Name are required.' });
      }

      try {
        // Delete from employee_salary
        await connection.execute(
          'DELETE FROM employee_salary WHERE first_name = ? AND last_name = ?',
          [delete_first_name, delete_last_name]
        );

        // Delete from historical tables
        await connection.execute(
          'DELETE FROM historical_salary_changes WHERE first_name = ? AND last_name = ?',
          [delete_first_name, delete_last_name]
        );
        await connection.execute(
          'DELETE FROM historical_salary_comments WHERE first_name = ? AND last_name = ?',
          [delete_first_name, delete_last_name]
        );
        await connection.execute(
          'DELETE FROM historical_bonuses WHERE first_name = ? AND last_name = ?',
          [delete_first_name, delete_last_name]
        );

        // Delete from latest_employee_data
        await connection.execute(
          'DELETE FROM latest_employee_data WHERE first_name = ? AND last_name = ?',
          [delete_first_name, delete_last_name]
        );

        res.status(200).json({ success: true, message: 'Employee deleted successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on https://burness.onrender.com`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();