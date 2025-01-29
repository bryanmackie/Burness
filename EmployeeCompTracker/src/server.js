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
      const { 
        m_first,
        first_name, 
        last_name, 
        salary, 
        comment_logged, 
        comment_date, 
        bonus, 
        title, 
        date_salary_set, 
        bonus_year 
      } = req.body;
    
      if (!first_name || !last_name) {
        return res.status(400).json({ success: false, message: 'First and Last Name are required.' });
      }
    
      // Sanitize inputs (e.g., set NULL for empty or invalid values)
      const validSalary = salary || null;
      const validBonus = bonus || null;
      const validBonusYear = (bonus_year && !isNaN(bonus_year) && Number.isInteger(Number(bonus_year))) ? Number(bonus_year) : null;
      const validCommentDate = (comment_logged && comment_date && !isNaN(Date.parse(comment_date))) ? comment_date : null;
    
      try {
        // Start a transaction
        await connection.beginTransaction();
    
        // Construct the SET clause dynamically
        const setClause = [
         // 'm_first = ?',
          'last_name = ?', 
          'first_name = ?', 
          'title = ?', 
          'salary = ?', 
          'date_salary_set = ?', 
          'comment_logged = ?', 
          'comment_date = ?', 
          'bonus = ?', 
          'bonus_year = ?'
        ].join(', ');
    
        const setValues = [
          last_name, 
          first_name, 
          title, 
          validSalary, 
          date_salary_set, 
          comment_logged || null, // if no comment_logged, set it to NULL
          validCommentDate, 
          validBonus, 
          validBonusYear // Set to NULL if invalid or empty
        ];
    
        // Execute the UPDATE query
        const [updateResult] = await connection.execute(
          `UPDATE employee_salary SET ${setClause} WHERE first_name = ? AND last_name = ?`,
          [...setValues, first_name, last_name]
        );
    
        if (updateResult.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
    
        // Conditionally insert into historical_salary_changes if salary is provided
        if (validSalary) {
          await connection.execute(
            'INSERT INTO historical_salary_changes (m_first, first_name, last_name, title, salary, date_salary_set) VALUES (?, ?, ?, ?, ?, ?)',
            [m_first, first_name, last_name, title, validSalary, date_salary_set]
          );
        }
    
        // Conditionally insert into historical_salary_comments if comment_logged is provided
        if (comment_logged) {
          await connection.execute(
            'INSERT INTO historical_salary_comments (m_first, first_name, last_name, title, comment_logged, comment_date) VALUES (?, ?, ?, ?, ?, ?)',
            [m_first, first_name, last_name, title, comment_logged, validCommentDate]
          );
        }
    
        // Conditionally insert into historical_bonuses if bonus is provided
        if (validBonus) {
          await connection.execute(
            'INSERT INTO historical_bonuses (m_first, first_name, last_name, title, bonus, bonus_year) VALUES (?, ?, ?, ?, ?, ?)',
            [m_first, first_name, last_name, title, validBonus, validBonusYear] // Use sanitized validBonusYear
          );
        }
    
        // Insert into pushInc (assuming this is for updating latest_employee_data)
        await connection.execute('INSERT INTO pushInc (first_name, last_name) VALUES (?, ?)', [first_name, last_name]);
    
        // Commit the transaction
        await connection.commit();
    
        res.status(200).json({ success: true, message: 'Record updated and historical data inserted successfully.' });
      } catch (error) {
        // Rollback transaction in case of any errors
        await connection.rollback();
        console.error('Error during transaction:', error);
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
    // Rest of your code...
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1); // Exit the process if the database connection fails
  }
};

// Start the server
startServer();
