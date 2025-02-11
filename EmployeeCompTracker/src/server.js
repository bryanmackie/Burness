import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import createConnection from './config/db.js'; // Import the database connection
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

const sanitizeNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;  // Replace empty string or null/undefined with NULL
  }
  const parsedValue = parseFloat(value);
  return !Number.isNaN(parsedValue) ? parsedValue : null;  // If it's a valid number, return it, else NULL
};

// Initialize the database connection and start the server
const startServer = async () => {
  try {
    const client = await createConnection();  // Create the database connection
    console.log('Database connected successfully.');

    // Routes

    // Get all employees
    app.get('/api/employees', async (req, res) => {
      try {
        const result = await client.query('SELECT first_name, last_name FROM latest_employee_data ORDER BY last_name ASC');
        res.status(200).json({ success: true, data: result.rows });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Get first names by last name
    app.get('/api/first-names/:last_name', async (req, res) => {
      const { last_name } = req.params;
      try {
        const result = await client.query(
          'SELECT first_name FROM latest_employee_data WHERE last_name = $1',
          [last_name]
        );
        res.status(200).json({ success: true, data: result.rows });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });
    // Routes

    // Update employee compensation
    app.post('/update', async (req, res) => {
      const {
        m_first, first_name, last_name, primaryTitle, secondaryTitle, salary,
        date_salary_set, comment_logged, comment_date, bonus, bonus_year
      } = req.body;

      // Validate required fields
      if (!m_first || !first_name || !last_name) {
        return res.status(400).json({ success: false, message: 'Manager first name, First name, and Last name are required.' });
      }
      const sanitizedSalary = sanitizeNumber(salary);
      const sanitizedBonus = sanitizeNumber(bonus);
      const sanitizedBonusYear = sanitizeNumber(bonus_year);
      const sanitizedDateSalarySet = date_salary_set === "" ? null : date_salary_set;
      const sanitizedCommentDate = comment_date === "" ? null : comment_date;
      try {
        // Construct the SET clause dynamically, only including non-null fields
        const setClause = [];
        const setValues = [];

       
        if (sanitizedSalary !== null) {
          setClause.push(`salary = $${setValues.length + 1}`);
          setValues.push(sanitizedSalary);
        }
        if (sanitizedDateSalarySet !== null) {
          setClause.push(`date_salary_set = $${setValues.length + 1}`);
          setValues.push(sanitizedDateSalarySet);
        }
        if (comment_logged !== null) {
          setClause.push(`comment_logged = $${setValues.length + 1}`);
          setValues.push(comment_logged);
        }
        if (sanitizedCommentDate !== null) {
          setClause.push(`comment_date = $${setValues.length + 1}`);
          setValues.push(sanitizedCommentDate);
        }
        if (sanitizedBonus !== null) {
          setClause.push(`bonus = $${setValues.length + 1}`);
          setValues.push(sanitizedBonus);
        }
        if (sanitizedBonusYear !== null) {
          setClause.push(`bonus_year = $${setValues.length + 1}`);
          setValues.push(sanitizedBonusYear);
        }
        if (primaryTitle !== null) {
          setClause.push(`primaryTitle = $${setValues.length + 1}`);
          setValues.push(primaryTitle);
        }
        if (secondaryTitle !== null) {
          setClause.push(`secondaryTitle = $${setValues.length + 1}`);
          setValues.push(secondaryTitle);
        }
        if (setClause.length === 0) {
          return res.status(400).json({ success: false, message: 'No fields to update.' });
        }

        // Final query
        const query = `UPDATE employee_salary SET ${setClause.join(', ')} WHERE first_name = $${setValues.length + 1} AND last_name = $${setValues.length + 2}`;
        setValues.push(first_name, last_name);

        const updateResult = await client.query(query, setValues);

        if (updateResult.rowCount === 0) {
          return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        // Insert into historical_salary_changes (including m_first before first_name)
        if (sanitizedSalary){
        await client.query(
          'INSERT INTO historical_salary_changes (m_first, first_name, last_name, primaryTitle, secondaryTitle, salary, date_salary_set) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [m_first, first_name, last_name, primaryTitle, secondaryTitle, sanitizedSalary, sanitizedDateSalarySet]
        );
      }
      if (comment_logged) {
        // Insert into historical_salary_comments (including m_first before first_name)
        await client.query(
          'INSERT INTO historical_salary_comments (m_first, first_name, last_name, primaryTitle, secondaryTitle, comment_logged, comment_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [m_first, first_name, last_name, primaryTitle, secondaryTitle, comment_logged, sanitizedCommentDate]
        );
      }
      if (sanitizedBonus) {
        // Insert into historical_bonuses (including m_first before first_name)
        await client.query(
          'INSERT INTO historical_bonuses (m_first, first_name, last_name, primaryTitle, secondaryTitle, bonus, bonus_year) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [m_first, first_name, last_name, primaryTitle, secondaryTitle, sanitizedBonus, sanitizedBonusYear]
        );
      }

        // Trigger pushInc to update latest_employee_data
        await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [first_name, last_name]);

        res.status(200).json({ success: true, message: 'Record updated and historical data inserted successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Add a new employee
    app.post('/add-employee', async (req, res) => {
      const {add_first_name, add_last_name } = req.body;

      // Validate required fields
      if (!add_first_name || !add_last_name) {
        return res.status(400).json({ success: false, message: 'Manager First Name, First Name, and Last Name are required.' });
      }

      try {
        // Insert into employee_salary
        await client.query(
          'INSERT INTO employee_salary (first_name, last_name) VALUES ($1, $2)',
          [add_first_name, add_last_name]
        );

        // Trigger pushInc to update latest_employee_data
        await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [add_first_name, add_last_name]);

        res.status(200).json({ success: true, message: 'Employee added successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Delete an employee
    app.post('/delete-employee', async (req, res) => {
      const {delete_first_name, delete_last_name } = req.body;

      // Validate required fields
      if (!delete_first_name || !delete_last_name) {
        return res.status(400).json({ success: false, message: 'Manager First Name, First Name, and Last Name are required.' });
      }

      try {
        // Delete from employee_salary
        await client.query(
          'DELETE FROM employee_salary WHERE first_name = $1 AND last_name = $2',
          [delete_first_name, delete_last_name]
        );

        // Trigger pushInc to update latest_employee_data
        await client.query('INSERT INTO pushInc (first_name, last_name) VALUES ($1, $2)', [delete_first_name, delete_last_name]);

        res.status(200).json({ success: true, message: 'Employee deleted successfully.' });
      } catch (error) {
        handleDatabaseError(res, error);
      }
    });

    // Start the server
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

// Start the server
startServer();
